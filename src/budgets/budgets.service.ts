import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, and, desc } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { DRIZZLE } from '../database/database.module.js'
import * as schema from '../database/schema/index.js'
import { budgets, expenses } from '../database/schema/index.js'
import { CreateBudgetDto, BudgetType } from './dto/create-budget.dto.js'
import { UpdateBudgetDto } from './dto/update-budget.dto.js'
import { filterExpensesForMonth } from '../common/utils/recurrence.js'

@Injectable()
export class BudgetsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * GET /budgets
   */
  async getBudgets(coupleId: string) {
    return this.db
      .select()
      .from(budgets)
      .where(eq(budgets.coupleId, coupleId))
      .orderBy(desc(budgets.createdAt))
  }

  /**
   * POST /budgets
   */
  async createBudget(coupleId: string, ownerId: string, dto: CreateBudgetDto) {
    if (!Object.values(BudgetType).includes(dto.type)) {
      throw new BadRequestException('Tipo de presupuesto inválido')
    }

    if (dto.type === BudgetType.INDIVIDUAL && !dto.user_id) {
      throw new BadRequestException(
        'Presupuestos individuales requieren user_id',
      )
    }

    const inserted = await this.db
      .insert(budgets)
      .values({
        id: dto.id ?? randomUUID(),
        coupleId,
        ownerId,
        name: dto.name,
        type: dto.type,
        limit: String(dto.limit ?? 0),
        userId: dto.user_id ?? null,
        associatedCard: dto.associated_card ?? null,
        defaultSplitMethod: dto.default_split_method ?? null,
      })
      .returning()

    if (!inserted[0]) {
      throw new InternalServerErrorException('Error al crear presupuesto')
    }

    return inserted[0]
  }

  /**
   * PUT /budgets/:id
   */
  async updateBudget(coupleId: string, id: string, dto: UpdateBudgetDto) {
    const existingResult = await this.db
      .select({ coupleId: budgets.coupleId })
      .from(budgets)
      .where(eq(budgets.id, id))
      .limit(1)

    const existing = existingResult[0]
    if (!existing) {
      throw new NotFoundException('Presupuesto no encontrado')
    }

    if (existing.coupleId !== coupleId) {
      throw new BadRequestException(
        'No tienes permiso para modificar este presupuesto',
      )
    }

    if (dto.type === BudgetType.INDIVIDUAL && !dto.user_id) {
      throw new BadRequestException(
        'Presupuestos individuales requieren user_id',
      )
    }

    const updatePayload: Partial<schema.NewBudget> = {}
    if (dto.name !== undefined) updatePayload.name = dto.name
    if (dto.type !== undefined) updatePayload.type = dto.type
    if (dto.limit !== undefined) updatePayload.limit = String(dto.limit)
    if (dto.user_id !== undefined) updatePayload.userId = dto.user_id
    if (dto.associated_card !== undefined)
      updatePayload.associatedCard = dto.associated_card
    if (dto.default_split_method !== undefined)
      updatePayload.defaultSplitMethod = dto.default_split_method

    const updated = await this.db
      .update(budgets)
      .set(updatePayload)
      .where(eq(budgets.id, id))
      .returning()

    if (!updated[0]) {
      throw new InternalServerErrorException('Error al actualizar presupuesto')
    }

    return updated[0]
  }

  /**
   * DELETE /budgets/:id
   * Desvincula los gastos antes de eliminar para preservar integridad.
   */
  async deleteBudget(coupleId: string, id: string) {
    const budgetResult = await this.db
      .select({ coupleId: budgets.coupleId })
      .from(budgets)
      .where(eq(budgets.id, id))
      .limit(1)

    const budget = budgetResult[0]
    if (!budget) {
      throw new NotFoundException('Presupuesto no encontrado')
    }

    if (budget.coupleId !== coupleId) {
      throw new BadRequestException(
        'No tienes permiso para eliminar este presupuesto',
      )
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(expenses)
        .set({ budgetId: null })
        .where(eq(expenses.budgetId, id))

      await tx.delete(budgets).where(eq(budgets.id, id))
    })

    return { deleted: true, id }
  }

  /**
   * GET /budgets/:id/summary?month=X&year=Y
   *
   * Calcula métricas de ejecución de un presupuesto para el mes indicado:
   * gasto total, saldo restante, promedio diario y proyección al fin de mes.
   *
   * Incluye gastos recurrentes activos en el mes (monthly, weekly, yearly).
   * Lógica replicada de useBudgetDetail del frontend.
   */
  async getBudgetSummary(
    coupleId: string,
    budgetId: string,
    month: number,
    year: number,
  ) {
    const [budgetResult, allBudgetExpenses] = await Promise.all([
      this.db
        .select()
        .from(budgets)
        .where(and(eq(budgets.id, budgetId), eq(budgets.coupleId, coupleId)))
        .limit(1),
      this.db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.budgetId, budgetId),
            eq(expenses.coupleId, coupleId),
          ),
        ),
    ])

    const budget = budgetResult[0]
    if (!budget) throw new NotFoundException('Presupuesto no encontrado')

    const budgetExpenses = filterExpensesForMonth(allBudgetExpenses, month, year)

    const limit = Number(budget.limit)
    const totalSpent = budgetExpenses.reduce((s, e) => s + Number(e.amount), 0)
    const remaining = Math.max(0, limit - totalSpent)
    const percentage = limit > 0 ? Math.min(100, (totalSpent / limit) * 100) : 0

    const today = new Date()
    const isCurrentMonth =
      today.getFullYear() === year && today.getMonth() + 1 === month
    const daysInMonth = new Date(year, month, 0).getDate()
    const daysPassed = isCurrentMonth ? today.getDate() : daysInMonth
    const dailyAverage = daysPassed > 0 ? totalSpent / daysPassed : 0
    const projectedSpend = dailyAverage * daysInMonth

    return {
      budgetId: budget.id,
      name: budget.name,
      type: budget.type,
      limit,
      totalSpent: Math.round(totalSpent),
      remaining: Math.round(remaining),
      percentage: Math.round(percentage * 10) / 10,
      dailyAverage: Math.round(dailyAverage),
      projectedSpend: Math.round(projectedSpend),
      expensesCount: budgetExpenses.length,
    }
  }
}
