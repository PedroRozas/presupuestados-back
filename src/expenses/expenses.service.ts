import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, inArray, desc, gte, lte } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { expenses, incomes, deductions } from '../database/schema/index.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { UpdateRecurringExpenseDto } from './dto/update-recurring-expense.dto.js';
import { StopRecurringExpenseDto } from './dto/stop-recurring-expense.dto.js';
import { DeleteExpensesBatchDto } from './dto/delete-expenses-batch.dto.js';
import {
  getPreviousMonthEndDate,
  normalizeRecurrenceInterval,
} from '../common/utils/recurrence.js';
import { CoupleContextService } from '../common/services/couple-context.service.js';

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly coupleContextService: CoupleContextService,
  ) {}

  private async calculateSplitDetails(expenseDate: Date, coupleId: string) {
    const year = expenseDate.getFullYear();
    const month = expenseDate.getMonth() + 1;

    const allIncomes = await this.db
      .select({
        amount: incomes.amount,
        userId: incomes.userId,
        date: incomes.date,
      })
      .from(incomes)
      .where(eq(incomes.coupleId, coupleId));

    if (allIncomes.length === 0) {
      return { msg: 'No incomes found for the month, using 50/50 fallback.' };
    }

    const currentMonthIncomes = allIncomes.filter((inc) => {
      const incDate = new Date(inc.date);
      return incDate.getFullYear() === year && incDate.getMonth() + 1 === month;
    });

    if (currentMonthIncomes.length === 0) {
      return { msg: 'No incomes found for the month, using 50/50 fallback.' };
    }

    const userTotals: Record<string, number> = {};
    for (const inc of currentMonthIncomes) {
      userTotals[inc.userId] =
        (userTotals[inc.userId] || 0) + Number(inc.amount);
    }

    const userIds = Object.keys(userTotals);
    const totalIncome = Object.values(userTotals).reduce(
      (sum, val) => sum + val,
      0,
    );

    const splitPercentages: Record<string, number> = {};
    for (const userId of userIds) {
      splitPercentages[userId] =
        totalIncome > 0 ? (userTotals[userId] / totalIncome) * 100 : 50;
    }

    return { totalIncome, splitPercentages };
  }

  async addExpense(
    coupleId: string,
    ownerId: string,
    createExpenseDto: CreateExpenseDto,
  ) {
    if (createExpenseDto.p_split_method === 'proportional') {
      await this.calculateSplitDetails(
        new Date(createExpenseDto.p_date),
        coupleId,
      );
    }

    await Promise.all([
      this.coupleContextService.assertOptionalFamilyMemberBelongsToCouple(
        coupleId,
        createExpenseDto.p_assigned_user_id,
      ),
      this.coupleContextService.assertOptionalBudgetBelongsToCouple(
        coupleId,
        createExpenseDto.p_budget_id,
      ),
    ]);

    const inserted = await this.db
      .insert(expenses)
      .values({
        id: createExpenseDto.p_expense_id,
        amount: String(createExpenseDto.p_amount),
        assignedUserId: createExpenseDto.p_assigned_user_id || null,
        batchId: createExpenseDto.p_batch_id || null,
        batchName: createExpenseDto.p_batch_name ?? null,
        budgetId: createExpenseDto.p_budget_id || null,
        categoryId: createExpenseDto.p_category_id ?? 0,
        coupleId,
        date: new Date(createExpenseDto.p_date),
        description: createExpenseDto.p_description,
        isCredit: createExpenseDto.p_is_credit ?? false,
        isRecurring: createExpenseDto.p_is_recurring,
        ownerId,
        paidBy: createExpenseDto.p_paid_by,
        recurrenceEndDate: createExpenseDto.p_recurrence_end_date
          ? new Date(createExpenseDto.p_recurrence_end_date)
          : null,
        recurrenceInterval: normalizeRecurrenceInterval(
          createExpenseDto.p_recurrence_interval,
        ),
        splitMethod: createExpenseDto.p_split_method,
      })
      .returning();

    if (!inserted[0])
      throw new InternalServerErrorException('Error al insertar gasto');
    return inserted[0];
  }

  async updateExpense(coupleId: string, updateExpenseDto: UpdateExpenseDto) {
    await Promise.all([
      this.coupleContextService.assertOptionalFamilyMemberBelongsToCouple(
        coupleId,
        updateExpenseDto.p_assigned_user_id,
      ),
      this.coupleContextService.assertOptionalBudgetBelongsToCouple(
        coupleId,
        updateExpenseDto.p_budget_id,
      ),
    ]);

    const updated = await this.db
      .update(expenses)
      .set({
        amount: String(updateExpenseDto.p_amount),
        assignedUserId: updateExpenseDto.p_assigned_user_id ?? null,
        batchId: updateExpenseDto.p_batch_id ?? null,
        batchName: updateExpenseDto.p_batch_name ?? null,
        budgetId: updateExpenseDto.p_budget_id ?? null,
        categoryId: updateExpenseDto.p_category_id ?? undefined,
        date: new Date(updateExpenseDto.p_date),
        description: updateExpenseDto.p_description,
        isCredit: updateExpenseDto.p_is_credit ?? null,
        isRecurring: updateExpenseDto.p_is_recurring,
        paidBy: updateExpenseDto.p_paid_by,
        recurrenceEndDate: updateExpenseDto.p_recurrence_end_date
          ? new Date(updateExpenseDto.p_recurrence_end_date)
          : null,
        recurrenceInterval: normalizeRecurrenceInterval(
          updateExpenseDto.p_recurrence_interval,
        ),
        splitMethod: updateExpenseDto.p_split_method,
      })
      .where(
        and(
          eq(expenses.id, updateExpenseDto.p_expense_id),
          eq(expenses.coupleId, coupleId),
        ),
      )
      .returning();

    if (!updated[0])
      throw new NotFoundException(
        'Gasto no encontrado o no tienes permiso para modificarlo',
      );
    return updated[0];
  }

  async updateRecurringExpense(
    coupleId: string,
    ownerId: string,
    updateRecurringDto: UpdateRecurringExpenseDto,
  ) {
    const oldExpenseId = updateRecurringDto.p_old_expense_id;

    // Obtener el gasto original y validar que pertenece a la pareja
    const currentResult = await this.db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.id, oldExpenseId), eq(expenses.coupleId, coupleId)),
      )
      .limit(1);

    const currentExpense = currentResult[0];
    if (!currentExpense) {
      throw new NotFoundException(`Expense with id ${oldExpenseId} not found`);
    }

    const newExpenseDto = updateRecurringDto.p_new_expense;
    const newExpenseDate = new Date(newExpenseDto.p_date);
    const cutoffDate = getPreviousMonthEndDate(newExpenseDate);
    const recurrenceInterval = normalizeRecurrenceInterval(
      newExpenseDto.p_recurrence_interval ?? currentExpense.recurrenceInterval,
    );

    // Fijar recurrence_end_date en el gasto original (validando coupleId)
    await this.db
      .update(expenses)
      .set({
        recurrenceEndDate: cutoffDate,
      })
      .where(
        and(eq(expenses.id, oldExpenseId), eq(expenses.coupleId, coupleId)),
      );

    // Insertar nuevo gasto recurrente con el coupleId validado
    const inserted = await this.db
      .insert(expenses)
      .values({
        id: newExpenseDto.p_expense_id,
        amount: String(newExpenseDto.p_amount),
        assignedUserId: newExpenseDto.p_assigned_user_id ?? null,
        batchId: newExpenseDto.p_batch_id ?? null,
        batchName: newExpenseDto.p_batch_name ?? null,
        budgetId: newExpenseDto.p_budget_id ?? null,
        categoryId: newExpenseDto.p_category_id ?? undefined,
        date: newExpenseDate,
        description: newExpenseDto.p_description,
        isCredit: newExpenseDto.p_is_credit ?? false,
        isRecurring: true,
        paidBy: newExpenseDto.p_paid_by,
        recurrenceEndDate: null,
        recurrenceInterval,
        splitMethod: newExpenseDto.p_split_method,
        coupleId,
        ownerId,
      })
      .returning();

    if (!inserted[0])
      throw new InternalServerErrorException(
        'Error al insertar gasto recurrente',
      );
    return inserted[0];
  }

  async stopRecurringExpense(
    coupleId: string,
    stopRecurringDto: StopRecurringExpenseDto,
  ) {
    const updated = await this.db
      .update(expenses)
      .set({ recurrenceEndDate: new Date(stopRecurringDto.p_end_date) })
      .where(
        and(
          eq(expenses.id, stopRecurringDto.p_expense_id),
          eq(expenses.coupleId, coupleId),
        ),
      )
      .returning();

    if (!updated[0]) {
      throw new NotFoundException(
        'Gasto no encontrado o no tienes permiso para modificarlo',
      );
    }
    return updated[0];
  }

  async deleteExpensesBatch(
    coupleId: string,
    deleteBatchDto: DeleteExpensesBatchDto,
  ) {
    const deleted = await this.db
      .delete(expenses)
      .where(
        and(
          inArray(expenses.id, deleteBatchDto.p_expense_ids),
          eq(expenses.coupleId, coupleId),
        ),
      )
      .returning();

    return { deleted: deleted.length };
  }

  /**
   * GET /expenses
   * Lista gastos de la pareja con filtro opcional por mes y año.
   */
  async listExpenses(coupleId: string, month?: number, year?: number) {
    if (month !== undefined && year !== undefined) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      return this.db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.coupleId, coupleId),
            gte(expenses.date, startDate),
            lte(expenses.date, endDate),
          ),
        )
        .orderBy(desc(expenses.date));
    }

    return this.db
      .select()
      .from(expenses)
      .where(eq(expenses.coupleId, coupleId))
      .orderBy(desc(expenses.date));
  }

  /**
   * DELETE /expenses/:id
   */
  async deleteExpense(coupleId: string, id: string) {
    const deleted = await this.db
      .delete(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.coupleId, coupleId)))
      .returning();

    if (!deleted[0]) {
      throw new NotFoundException(
        'Gasto no encontrado o sin permiso para eliminarlo',
      );
    }

    return { deleted: true, id: deleted[0].id };
  }

  // --- Methods for Chatbot Function Calling (RAG) ---

  async getMonthlyExpenses(coupleId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return this.db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, coupleId),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate),
        ),
      )
      .orderBy(desc(expenses.date));
  }

  async getIncomes(coupleId: string, _year: number, _month: number) {
    return this.db.select().from(incomes).where(eq(incomes.coupleId, coupleId));
  }

  async getDeductions(coupleId: string) {
    return this.db
      .select()
      .from(deductions)
      .where(eq(deductions.coupleId, coupleId));
  }

  async updateExpenseCategory(
    coupleId: string,
    expenseId: string,
    categoryId: number,
  ) {
    const updated = await this.db
      .update(expenses)
      .set({ categoryId })
      .where(and(eq(expenses.id, expenseId), eq(expenses.coupleId, coupleId)))
      .returning();

    if (!updated[0]) {
      throw new NotFoundException('Expense not found or unauthorized');
    }
    return updated[0];
  }
}
