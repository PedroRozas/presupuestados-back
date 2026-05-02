import {
  Inject,
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, and } from 'drizzle-orm'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI } from '@google/genai'
import { DRIZZLE } from '../database/database.module.js'
import * as schema from '../database/schema/index.js'
import { profiles, familyMembers } from '../database/schema/index.js'
import { ExpensesService } from '../expenses/expenses.service.js'
import { ChatDto } from './dto/chat.dto.js'

@Injectable()
export class ChatbotService {
  private ai: GoogleGenAI

  constructor(
    private readonly configService: ConfigService,
    private readonly expensesService: ExpensesService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')
    if (!apiKey) {
      throw new InternalServerErrorException('GEMINI_API_KEY no configurada')
    }
    this.ai = new GoogleGenAI({ apiKey })
  }

  async chat(userId: string, dto: ChatDto) {
    const result = await this.db
      .select({ coupleId: profiles.coupleId, isPremium: profiles.isPremium, fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1)

    const profile = result[0]

    if (!profile) {
      throw new InternalServerErrorException(
        'Error al obtener perfil del usuario',
      )
    }

    if (!profile.coupleId) {
      throw new BadRequestException('El usuario no pertenece a una pareja')
    }

    const coupleId = profile.coupleId

    const memberResult = await this.db
      .select({ id: familyMembers.id, name: familyMembers.name })
      .from(familyMembers)
      .where(and(eq(familyMembers.coupleId, coupleId), eq(familyMembers.linkedUserId, userId)))
      .limit(1)

    const currentMember = memberResult[0]

    const sanitize = (text: string) =>
      text
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars
        .trim()
        .slice(0, 1000)

    const INJECTION_PATTERNS = [
      /ignore\s+(previous|above|all)\s+instructions?/i,
      /new\s+instructions?:/i,
      /system\s*prompt/i,
      /you\s+are\s+now/i,
      /forget\s+(everything|all|your)/i,
      /act\s+as\s+(a\s+)?(?!financial)/i,
      /jailbreak/i,
      /DAN\b/,
    ]

    const isSuspicious = (text: string) =>
      INJECTION_PATTERNS.some((pattern) => pattern.test(text))

    const cleanMessage = sanitize(dto.message)

    if (isSuspicious(cleanMessage)) {
      throw new BadRequestException('Mensaje no permitido')
    }

    const cleanHistory = (dto.history ?? [])
      .slice(-10)
      .map((m) => ({ role: m.role, text: sanitize(m.text) }))
      .filter((m) => !isSuspicious(m.text))

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
              'Obtiene todos los ingresos fijos (sueldos) de la pareja. Los ingresos son registros permanentes, no varían por mes. Úsalo siempre que necesites saber los sueldos o hacer cálculos proporcionales.',
            parameters: {
              type: 'OBJECT',
              properties: {
                year: { type: 'INTEGER', description: 'El año (ignorado internamente, los ingresos son fijos)' },
                month: {
                  type: 'INTEGER',
                  description: 'El mes (ignorado internamente, los ingresos son fijos)',
                },
              },
              required: ['year', 'month'],
            },
          },
          {
            name: 'get_deductions',
            description:
              'Obtiene todas las deducciones de salario (AFP, salud, impuestos, etc.) de la pareja. Son registros permanentes por persona. Úsalo para calcular el sueldo líquido de cada uno.',
            parameters: {
              type: 'OBJECT',
              properties: {},
              required: [],
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
    ]

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    const userName = profile.fullName ?? 'el usuario'
    const memberName = currentMember?.name ?? userName
    const memberId = currentMember?.id ?? null

    const systemInstruction = `Eres un asistente financiero inteligente integrado en la app Presupuestados.
Ayudas a una pareja a gestionar sus gastos e ingresos compartidos. Responde de forma concisa, clara y amigable.
La fecha actual es ${currentYear}-${String(currentMonth).padStart(2, '0')}. Cuando el usuario diga "este mes" o similar, usa mes=${currentMonth} y año=${currentYear} sin pedirle confirmación.

## Usuario actual
- Nombre: ${memberName}
- family_member_id: ${memberId ?? 'desconocido'}

## Estructura de gastos
Cada gasto tiene:
- paid_by: quién pagó (family_member_id)
- assigned_user_id: si es individual, a quién se asigna (family_member_id); si es null, es compartido
- split_method: '50/50' | 'proportional' | 'individual'

## Cómo calcular el sobrante INDIVIDUAL del usuario actual
1. Llama a get_incomes → filtra los ingresos donde user_id = ${memberId ?? 'el id del usuario actual'}
2. Llama a get_deductions → filtra deducciones donde user_id = ${memberId ?? 'el id del usuario actual'} → sueldo líquido = ingreso bruto - deducciones
3. Llama a get_monthly_expenses → para cada gasto:
   - Si split_method = 'individual' y assigned_user_id = ${memberId ?? 'el id del usuario actual'}: sumar monto completo
   - Si split_method = '50/50': sumar monto / 2
   - Si split_method = 'proportional': necesitas calcular el % proporcional del usuario sobre el total de sueldos líquidos de la pareja
   - Si is_credit = true: restar del total de gastos
4. Sobrante = sueldo líquido del usuario - gastos que le corresponden

Cuando el usuario diga "mi dinero", "mis gastos", "mi sobrante" — calcular SOLO para ${memberName}, no la pareja completa.
No muestres los IDs UUID al usuario, usa las descripciones.`

    const contents: any[] = [
      ...cleanHistory.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      { role: 'user', parts: [{ text: cleanMessage }] },
    ]

    let response
    try {
      response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: {
          systemInstruction,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          tools: tools as any,
        },
      })
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      throw new InternalServerErrorException(
        `Error contacting AI model: ${errorMessage}`,
      )
    }

    // Procesar function calls en loop (el modelo puede necesitar múltiples herramientas)
    const MAX_ROUNDS = 5
    let rounds = 0

    while (rounds < MAX_ROUNDS) {
      const functionCalls = response.functionCalls
      if (!functionCalls || functionCalls.length === 0) break

      if (response.candidates && response.candidates.length > 0) {
        contents.push(response.candidates[0].content)
      }

      const functionResponseParts: any[] = []

      for (const call of functionCalls) {
        let functionResultData: unknown

        try {
          if (call.name === 'get_monthly_expenses') {
            const args = call.args as { year: number; month: number }
            functionResultData = await this.expensesService.getMonthlyExpenses(
              coupleId,
              args.year,
              args.month,
            )
          } else if (call.name === 'get_incomes') {
            const args = call.args as { year: number; month: number }
            functionResultData = await this.expensesService.getIncomes(
              coupleId,
              args.year,
              args.month,
            )
          } else if (call.name === 'get_deductions') {
            functionResultData = await this.expensesService.getDeductions(coupleId)
          } else if (call.name === 'update_expense_category') {
            const args = call.args as { expenseId: string; categoryId: number }
            functionResultData = await this.expensesService.updateExpenseCategory(
              coupleId,
              args.expenseId,
              args.categoryId,
            )
          } else {
            functionResultData = { error: 'Unknown function' }
          }
        } catch (e: unknown) {
          functionResultData = { error: e instanceof Error ? e.message : String(e) }
        }

        functionResponseParts.push({
          functionResponse: {
            name: call.name,
            response: { result: functionResultData },
          },
        })
      }

      contents.push({ role: 'user', parts: functionResponseParts })

      try {
        response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            tools: tools as any,
          },
        })
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        throw new InternalServerErrorException(
          `Error requesting final synthesis from AI: ${errorMessage}`,
        )
      }

      rounds++
    }

    return { response: response.text }
  }
}
