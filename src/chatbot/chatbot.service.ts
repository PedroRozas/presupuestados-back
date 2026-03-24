import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { ExpensesService } from '../expenses/expenses.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { ChatDto } from './dto/chat.dto.js';

@Injectable()
export class ChatbotService {
  private ai: GoogleGenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly expensesService: ExpensesService,
    private readonly supabaseService: SupabaseService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('GEMINI_API_KEY no configurada');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async chat(userId: string, dto: ChatDto) {
    const supabase = this.supabaseService.getClient();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('couple_id, is_premium')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new InternalServerErrorException(
        'Error al obtener perfil del usuario',
      );
    }

    if (!profile.couple_id) {
      throw new BadRequestException('El usuario no pertenece a una pareja');
    }

    const coupleId = profile.couple_id;

    const tools = [
      {
        functionDeclarations: [
          {
            name: 'get_monthly_expenses',
            description:
              'Obtiene los gastos de un mes y año específicos para la pareja del usuario.',
            parameters: {
              type: 'OBJECT',
              properties: {
                year: { type: 'INTEGER', description: 'El año, e.g. 2026' },
                month: {
                  type: 'INTEGER',
                  description: 'El mes numerico, e.g. 3 para marzo',
                },
              },
              required: ['year', 'month'],
            },
          },
          {
            name: 'get_incomes',
            description:
              'Obtiene los ingresos de la pareja para un mes y año específicos para verificar sueldos o calculo proporcional.',
            parameters: {
              type: 'OBJECT',
              properties: {
                year: { type: 'INTEGER', description: 'El año, e.g. 2026' },
                month: {
                  type: 'INTEGER',
                  description: 'El mes numerico, e.g. 3 para marzo',
                },
              },
              required: ['year', 'month'],
            },
          },
          {
            name: 'update_expense_category',
            description: 'Actualiza la categoría de un gasto existente.',
            parameters: {
              type: 'OBJECT',
              properties: {
                expenseId: {
                  type: 'STRING',
                  description: 'El ID UUID del gasto',
                },
                categoryId: {
                  type: 'INTEGER',
                  description: 'El ID de la nueva categoría',
                },
              },
              required: ['expenseId', 'categoryId'],
            },
          },
        ],
      },
    ];

    const systemInstruction = `Eres un asistente financiero inteligente integrado en la app Presupuestados. 
Ayudas a los usuarios (una pareja) a gestionar sus gastos e ingresos. Responde de forma concisa, clara y amigable.
Puedes solicitar datos en tiempo real llamando a las herramientas proporcionadas (get_monthly_expenses, get_incomes, update_expense_category).
No muestres los IDs UUID al usuario si no es estrictamente necesario, usa las descripciones de los gastos.`;

    const contents: any[] = [{ role: 'user', parts: [{ text: dto.message }] }];

    let response;
    try {
      response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          tools: tools as any,
        },
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(
        `Error contacting AI model: ${errorMessage}`,
      );
    }

    // Process function call if any
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      let functionResultData;

      try {
        if (call.name === 'get_monthly_expenses') {
          const args = call.args as { year: number; month: number };
          functionResultData = await this.expensesService.getMonthlyExpenses(
            coupleId,
            args.year,
            args.month,
          );
        } else if (call.name === 'get_incomes') {
          const args = call.args as { year: number; month: number };
          functionResultData = await this.expensesService.getIncomes(
            coupleId,
            args.year,
            args.month,
          );
        } else if (call.name === 'update_expense_category') {
          const args = call.args as { expenseId: string; categoryId: number };
          functionResultData = await this.expensesService.updateExpenseCategory(
            coupleId,
            args.expenseId,
            args.categoryId,
          );
        } else {
          functionResultData = { error: 'Unknown function request from model' };
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        functionResultData = { error: errorMessage };
      }

      // Add Model's response part containing the function call
      if (response.candidates && response.candidates.length > 0) {
        contents.push(response.candidates[0].content);
      }

      // Add functioning response part
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: { result: functionResultData },
            },
          },
        ],
      });

      // Synthesis step
      try {
        response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            tools: tools as any,
          },
        });
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new InternalServerErrorException(
          `Error requesting final synthesis from AI: ${errorMessage}`,
        );
      }
    }

    return { response: response.text };
  }
}
