import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { profiles, expenseCategories } from '../database/schema/index.js';
import { ProcessStatementDto } from './dto/process-statement.dto.js';

export interface UploadedFile {
  mimetype: string;
  buffer: Buffer;
  originalname?: string;
  size?: number;
}

interface ExtractedStatementExpense {
  date: string;
  description: string;
  amount: number;
  category_id: number;
  category_name: string;
}

interface ExtractedStatementResponse {
  expenses: ExtractedStatementExpense[];
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('OPENAI_API_KEY no configurada');
    }

    this.openai = new OpenAI({ apiKey });
    this.model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.5';
  }

  async processStatement(
    userId: string,
    file: UploadedFile,
    dto: ProcessStatementDto,
  ) {
    // 1. Verificación Premium. Esta función no requiere pareja: solo previsualiza gastos.
    const profileResult = await this.db
      .select({
        isPremium: profiles.isPremium,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    const profile = profileResult[0];

    if (!profile) {
      throw new InternalServerErrorException(
        'Error al obtener perfil del usuario',
      );
    }
    if (!profile.isPremium) {
      throw new ForbiddenException('Esta función requiere suscripción premium');
    }

    // 2. Obtener las categorías de la BD
    const categories = await this.db.select().from(expenseCategories);
    const categoryNamesById = new Map(categories.map((c) => [c.id, c.name]));
    const fallbackCategoryId =
      categories.find((c) => /varios|otros|general/i.test(c.name))?.id ?? 0;
    const categoriesContext =
      categories.length > 0
        ? categories.map((c) => `${c.id}: ${c.name}`).join(', ')
        : `${fallbackCategoryId}: Varios`;

    // 3. Preparar archivo y prompt para LLM
    const base64Data = file.buffer.toString('base64');
    const targetDate = this.getTargetDate(dto);
    const fileContent = this.buildFileContent(file, base64Data);
    const promptText = this.buildStatementPrompt(targetDate, categoriesContext);

    let responseText: string;
    try {
      const response = await this.openai.responses.create({
        model: this.model,
        instructions: this.buildSystemPrompt(),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: promptText,
              },
              fileContent,
            ],
          },
        ],
        max_output_tokens: 6000,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'statement_expense_extraction',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                expenses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      date: {
                        type: 'string',
                        description: 'Fecha del gasto en formato YYYY-MM-DD',
                      },
                      description: {
                        type: 'string',
                        description:
                          'Comercio limpio. Incluye cuota X/Y si aplica.',
                      },
                      amount: {
                        type: 'number',
                        description:
                          'Monto final del cargo, positivo, sin separadores.',
                      },
                      category_id: {
                        type: 'integer',
                        description:
                          'ID exacto de una categoría del catálogo o 0.',
                      },
                      category_name: {
                        type: 'string',
                        description:
                          'Nombre de la categoría elegida del catálogo.',
                      },
                    },
                    required: [
                      'date',
                      'description',
                      'amount',
                      'category_id',
                      'category_name',
                    ],
                  },
                },
              },
              required: ['expenses'],
            },
          },
        },
      });

      responseText = response.output_text;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(
        `Error contactando OpenAI: ${errorMessage}`,
      );
    }

    let parsedData: ExtractedStatementResponse;
    try {
      if (!responseText) throw new Error('La IA devolvió una respuesta vacía');
      parsedData = JSON.parse(responseText) as ExtractedStatementResponse;
    } catch {
      this.logger.error(`Error parseando JSON de OpenAI: ${responseText}`);
      throw new InternalServerErrorException(
        'Error procesando el resultado de la IA',
      );
    }

    const normalizedExpenses = this.normalizeExpenses(
      parsedData,
      categoryNamesById,
      fallbackCategoryId,
      targetDate,
    );

    if (normalizedExpenses.length === 0) {
      return { msg: 'No se extrajeron gastos', expenses: [] };
    }

    return {
      expenses: normalizedExpenses,
    };
  }

  private buildSystemPrompt() {
    return `Eres un extractor financiero para Presupuestados.
Tu única tarea es convertir estados de cuenta, cartolas, boletas o capturas bancarias en gastos revisables por el usuario.
Debes ser conservador: si una línea parece pago, abono, reversa, ajuste, devolución, transferencia recibida, saldo, impuesto informativo o movimiento que no sea una compra/cargo de consumo, no la devuelvas.
Devuelve solo compras, cargos, comisiones o suscripciones que el usuario tendría sentido registrar como gasto.
Si detectas una compra en cuotas, conserva esa información en el nombre del gasto como "Comercio cuota X/Y".`;
  }

  private buildStatementPrompt(targetDate: string, categoriesContext: string) {
    return `Analiza el archivo adjunto y extrae gastos.

Fecha de respaldo: ${targetDate}. Usa la fecha de la fila si es clara; si no existe o es ambigua, usa la fecha de respaldo.

Reglas de extracción:
- Devuelve solo cargos reales de consumo. Ignora siempre pagos, pagos de tarjeta, pagos de cuenta, abonos, sueldos, transferencias recibidas, devoluciones, reversas, anulaciones, saldos anteriores, intereses informativos y totales/resúmenes.
- Si una línea dice "Pago", "Pago tarjeta", "Pago recibido", "Abono", "Transferencia recibida", "Reversa" o "Devolución", no la incluyas aunque tenga monto.
- No incluyas subtotal, total facturado, total nacional, total internacional ni resumen de cuotas.
- El monto debe ser el cargo final positivo de esa fila, sin separadores de miles. En CLP, usa enteros.
- Limpia el comercio: usa un nombre corto y entendible, por ejemplo "Jumbo", "Uber", "Netflix".
- Si detectas cuotas, incluye la cuota en la descripción: "Comercio cuota 3/12". Reconoce formatos como "03/12", "3 de 12", "cuota 03", "C03/12", "N cuotas" o similares.
- Si hay fecha original de compra distinta a la fecha de facturación, agrega la fecha original al final: "Comercio cuota 3/12 (YYYY-MM-DD)".
- Clasifica cada gasto usando solo este catálogo de categorías:
${categoriesContext}
- category_id debe ser el ID exacto del catálogo. Si ninguna categoría encaja bien, usa 0 o la categoría general/Varios del catálogo.
- category_name debe coincidir con el nombre de la categoría elegida.`;
  }

  private buildFileContent(file: UploadedFile, base64Data: string) {
    if (file.mimetype === 'application/pdf') {
      return {
        type: 'input_file' as const,
        filename: file.originalname ?? 'estado-de-cuenta.pdf',
        file_data: `data:${file.mimetype};base64,${base64Data}`,
        detail: 'high' as const,
      };
    }

    if (file.mimetype.startsWith('image/')) {
      return {
        type: 'input_image' as const,
        image_url: `data:${file.mimetype};base64,${base64Data}`,
        detail: 'high' as const,
      };
    }

    throw new BadRequestException(
      'Tipo de archivo no permitido. Solo se aceptan PDF, PNG, JPEG y WEBP',
    );
  }

  private getTargetDate(dto: ProcessStatementDto) {
    if (dto.target_date && /^\d{4}-\d{2}-\d{2}$/.test(dto.target_date)) {
      return dto.target_date;
    }

    return new Date().toISOString().split('T')[0];
  }

  private normalizeExpenses(
    parsedData: ExtractedStatementResponse,
    categoryNamesById: Map<number, string>,
    fallbackCategoryId: number,
    targetDate: string,
  ) {
    if (!Array.isArray(parsedData.expenses)) return [];

    return parsedData.expenses
      .filter((expense) => {
        const amount = Number(expense.amount);
        return (
          Number.isFinite(amount) &&
          amount > 0 &&
          typeof expense.description === 'string' &&
          expense.description.trim().length > 0 &&
          !this.isPaymentLikeDescription(expense.description)
        );
      })
      .map((expense) => {
        const categoryId = categoryNamesById.has(expense.category_id)
          ? expense.category_id
          : fallbackCategoryId;
        const category = categoryNamesById.get(categoryId) ?? 'Varios';

        return {
          date: this.normalizeDate(expense.date, targetDate),
          description: expense.description.replace(/\s+/g, ' ').trim(),
          amount: Math.round(Number(expense.amount)),
          category,
          categoryId,
        };
      });
  }

  private normalizeDate(date: string, fallbackDate: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }

    return fallbackDate;
  }

  private isPaymentLikeDescription(description: string) {
    const normalized = description
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return [
      /\babono\b/,
      /\bdevolucion\b/,
      /\breversa\b/,
      /\banulacion\b/,
      /\btransferencia recibida\b/,
      /\bpago recibido\b/,
      /\bpago\s+(de\s+)?(tarjeta|tc|credito|cuenta|prestamo|linea de credito)\b/,
    ].some((pattern) => pattern.test(normalized));
  }
}
