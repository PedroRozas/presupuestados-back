import {
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ProcessStatementDto } from './dto/process-statement.dto';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Database } from '../supabase/database.types';

export interface UploadedFile {
  mimetype: string;
  buffer: Buffer;
  originalname?: string;
  size?: number;
}

type ExpenseInsert = Database['public']['Tables']['expenses']['Insert'];

@Injectable()
export class AIService {
  private ai: GoogleGenAI;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('GEMINI_API_KEY no configurada');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async processStatement(
    userId: string,
    file: UploadedFile,
    dto: ProcessStatementDto,
  ) {
    const supabase = this.supabaseService.getClient();

    // 1. Verificación Premium y Obtener Couple/Member Info
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_premium, couple_id, default_split_method')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new InternalServerErrorException(
        'Error al obtener perfil del usuario',
      );
    }
    if (!profile.is_premium) {
      throw new ForbiddenException('Esta función requiere suscripción premium');
    }

    const coupleId = profile.couple_id;
    if (!coupleId) {
      throw new BadRequestException('El usuario no pertenece a una pareja');
    }

    // Identificar el ID del family_member actual para fallback
    const { data: familyMember, error: memberError } = await supabase
      .from('family_members')
      .select('id')
      .eq('linked_user_id', userId)
      .eq('couple_id', coupleId)
      .single();

    if (memberError || !familyMember) {
      throw new InternalServerErrorException(
        'Miembro familiar no encontrado para el usuario actual',
      );
    }
    const defaultMemberId = familyMember.id;
    const paidBy = dto.paid_by || defaultMemberId;
    const assignedUserId = dto.assigned_user_id || defaultMemberId;

    // 2. Obtener las categorías de la BD
    const { data } = await supabase.rpc('get_categories_rpc');
    const categories = data as { id: number; name: string }[] | null;
    const categoriesContext = categories
      ? categories.map((c) => `${c.id}: ${c.name}`).join(', ')
      : 'Varios';

    // 3. Preparar imagen y prompt para LLM
    const base64Data = file.buffer.toString('base64');
    const today = new Date().toISOString().split('T')[0];

    const promptText = `
Actúa como experto contable. Analiza la imagen o documento PDF, que es un estado de cuenta bancario.
La fecha objetivo para estos gastos es: ${today}.

Extrae GASTOS (ignora abonos, sueldos y transferencias recibidas).

Monto: TOTAL FINAL del gasto (con propina si aplica). Entero sin puntos.
Fecha: Usa esta fecha: ${today} en YYYY-MM-DD. Si puedes extraer la fecha de la propia fila, hazlo.
Descripción: Nombre del comercio de forma clara y limpia (ej: "Jumbo", "Uber") solo la primera letra mayúscula, agregando la fecha original de la compra YYYY-MM-DD al final si la encuentras.
Categoría ID: Clasifica el gasto utilizando SOLAMENTE una de las siguientes categorías enviadas en este catálogo:
${categoriesContext}
Anota solamente el ID (entero) de la categoría que mejor corresponda. Si ninguna encaja bien, asígnale el ID de "Varios" u otro general.

OUTPUT JSON EXACTO DEBE TENER LA SIGUIENTE ESTRUCTURA Y NADA MÁS:
{ "expenses": [{ "date": "YYYY-MM-DD", "description": "X (YYYY-MM-DD)", "amount": 0, "category_id": 0 }] }
    `;

    // 4. Llamar a Gemini
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: file.mimetype,
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const resultText = response.text || '';
    let parsedData: {
      expenses: {
        date: string;
        description: string;
        amount: number;
        category_id: number;
      }[];
    };

    try {
      if (!resultText) throw new Error('La IA devolvió una respuesta vacía');
      const cleanJson = resultText.replace(/```json|```/g, '').trim();
      parsedData = JSON.parse(cleanJson) as { expenses: any[] };
    } catch {
      console.error('Error parseando JSON de Gemini:', resultText);
      throw new InternalServerErrorException(
        'Error procesando el resultado de la IA',
      );
    }

    if (!parsedData.expenses || parsedData.expenses.length === 0) {
      return { msg: 'No se extrajeron gastos', expenses: [] };
    }

    // 5. Insertar en Lote
    const batchId = randomUUID();
    const batchName = dto.batch_name || `Importación automatizada ${today}`;

    const expensesToInsert: ExpenseInsert[] = parsedData.expenses.map(
      (exp) => ({
        amount: exp.amount,
        description: exp.description,
        date: new Date(exp.date).toISOString(),
        category_id: exp.category_id,
        is_recurring: false,
        is_credit: false,
        batch_id: batchId,
        batch_name: batchName,
        paid_by: paidBy,
        assigned_user_id: assignedUserId,
        couple_id: coupleId,
        owner_id: userId,
        split_method: profile.default_split_method || 'equal',
      }),
    );

    const { data: insertedExpenses, error: insertError } = await supabase
      .from('expenses')
      .insert(expensesToInsert)
      .select();

    if (insertError) {
      throw new InternalServerErrorException(
        `Error al insertar lote de gastos: ${insertError.message}`,
      );
    }

    return {
      batch_id: batchId,
      batch_name: batchName,
      count: insertedExpenses.length,
      extracted: insertedExpenses,
    };
  }
}
