import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import {
  budgets,
  deductions,
  expenses,
  incomes,
} from '../database/schema/index.js';
import {
  getPreviousMonthEndDate,
  normalizeRecurrenceInterval,
} from '../common/utils/recurrence.js';
import { CreateExpenseDto } from '../expenses/dto/create-expense.dto.js';
import { ApplySimulationDto } from './dto/apply-simulation.dto.js';

type Tx = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

@Injectable()
export class SimulationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async apply(coupleId: string, ownerId: string, dto: ApplySimulationDto) {
    return this.db.transaction(async (tx) => {
      await this.applyIncomes(tx, coupleId, ownerId, dto.incomes);
      await this.applyDeductions(tx, coupleId, ownerId, dto.deductions);
      await this.applyBudgets(tx, coupleId, ownerId, dto.budgets);
      await this.applyExpenses(tx, coupleId, ownerId, dto.expenses);
      return { applied: true };
    });
  }

  private async applyIncomes(
    tx: Tx,
    coupleId: string,
    ownerId: string,
    changes: ApplySimulationDto['incomes'],
  ) {
    for (const dto of changes.created) {
      await tx.insert(incomes).values({
        id: dto.id ?? randomUUID(),
        userId: dto.user_id,
        coupleId,
        amount: String(dto.amount),
        description: dto.description ?? null,
        date: new Date(dto.date),
        ownerId,
      });
    }
    for (const dto of changes.updated) {
      if (!dto.id) continue;
      await tx
        .update(incomes)
        .set({
          userId: dto.user_id,
          amount: String(dto.amount),
          description: dto.description ?? null,
          date: new Date(dto.date),
        })
        .where(and(eq(incomes.id, dto.id), eq(incomes.coupleId, coupleId)));
    }
    if (changes.deletedIds.length > 0) {
      await tx
        .delete(incomes)
        .where(
          and(
            inArray(incomes.id, changes.deletedIds),
            eq(incomes.coupleId, coupleId),
          ),
        );
    }
  }

  private async applyDeductions(
    tx: Tx,
    coupleId: string,
    ownerId: string,
    changes: ApplySimulationDto['deductions'],
  ) {
    for (const dto of changes.created) {
      await tx.insert(deductions).values({
        id: dto.id ?? randomUUID(),
        userId: dto.user_id,
        coupleId,
        amount: String(dto.amount),
        description: dto.description ?? null,
        date: new Date(dto.date),
        ownerId,
      });
    }
    for (const dto of changes.updated) {
      if (!dto.id) continue;
      await tx
        .update(deductions)
        .set({
          userId: dto.user_id,
          amount: String(dto.amount),
          description: dto.description ?? null,
          date: new Date(dto.date),
        })
        .where(
          and(eq(deductions.id, dto.id), eq(deductions.coupleId, coupleId)),
        );
    }
    if (changes.deletedIds.length > 0) {
      await tx
        .delete(deductions)
        .where(
          and(
            inArray(deductions.id, changes.deletedIds),
            eq(deductions.coupleId, coupleId),
          ),
        );
    }
  }

  private async applyBudgets(
    tx: Tx,
    coupleId: string,
    ownerId: string,
    changes: ApplySimulationDto['budgets'],
  ) {
    for (const dto of changes.created) {
      await tx.insert(budgets).values({
        id: dto.id ?? randomUUID(),
        ownerId,
        coupleId,
        name: dto.name,
        type: dto.type,
        limit: String(dto.limit ?? 0),
        userId: dto.user_id ?? null,
        associatedCard: dto.associated_card ?? null,
        defaultSplitMethod: dto.default_split_method ?? '50/50',
      });
    }
    for (const dto of changes.updated) {
      if (!dto.id) continue;
      await tx
        .update(budgets)
        .set({
          name: dto.name,
          type: dto.type,
          limit: String(dto.limit ?? 0),
          userId: dto.user_id ?? null,
          associatedCard: dto.associated_card ?? null,
          defaultSplitMethod: dto.default_split_method ?? '50/50',
        })
        .where(and(eq(budgets.id, dto.id), eq(budgets.coupleId, coupleId)));
    }
    if (changes.deletedIds.length > 0) {
      await tx
        .delete(budgets)
        .where(
          and(
            inArray(budgets.id, changes.deletedIds),
            eq(budgets.coupleId, coupleId),
          ),
        );
    }
  }

  private async applyExpenses(
    tx: Tx,
    coupleId: string,
    ownerId: string,
    changes: ApplySimulationDto['expenses'],
  ) {
    for (const dto of changes.created) {
      await tx.insert(expenses).values(this.expenseValues(dto, coupleId, ownerId));
    }
    for (const dto of changes.updated) {
      if (!dto.p_expense_id) continue;
      await tx
        .update(expenses)
        .set(this.expenseSetValues(dto))
        .where(
          and(
            eq(expenses.id, dto.p_expense_id),
            eq(expenses.coupleId, coupleId),
          ),
        );
    }
    for (const op of changes.split) {
      const newDate = new Date(op.p_new_expense.p_date);
      await tx
        .update(expenses)
        .set({ recurrenceEndDate: getPreviousMonthEndDate(newDate) })
        .where(
          and(
            eq(expenses.id, op.p_old_expense_id),
            eq(expenses.coupleId, coupleId),
          ),
        );
      await tx.insert(expenses).values({
        ...this.expenseValues(op.p_new_expense, coupleId, ownerId),
        id: randomUUID(),
        isRecurring: true,
        recurrenceEndDate: null,
      });
    }
    for (const op of changes.stopped) {
      await tx
        .update(expenses)
        .set({ recurrenceEndDate: new Date(op.p_end_date) })
        .where(
          and(
            eq(expenses.id, op.p_expense_id),
            eq(expenses.coupleId, coupleId),
          ),
        );
    }
    if (changes.deletedIds.length > 0) {
      await tx
        .delete(expenses)
        .where(
          and(
            inArray(expenses.id, changes.deletedIds),
            eq(expenses.coupleId, coupleId),
          ),
        );
    }
  }

  private expenseValues(
    dto: CreateExpenseDto,
    coupleId: string,
    ownerId: string,
  ): typeof schema.expenses.$inferInsert {
    return {
      id: dto.p_expense_id,
      amount: String(dto.p_amount),
      assignedUserId: dto.p_assigned_user_id || null,
      batchId: dto.p_batch_id || null,
      batchName: dto.p_batch_name ?? null,
      budgetId: dto.p_budget_id || null,
      categoryId: dto.p_category_id ?? 0,
      coupleId,
      date: new Date(dto.p_date),
      description: dto.p_description,
      isCredit: dto.p_is_credit ?? false,
      isRecurring: dto.p_is_recurring ?? false,
      ownerId,
      paidBy: dto.p_paid_by,
      recurrenceEndDate: dto.p_recurrence_end_date
        ? new Date(dto.p_recurrence_end_date)
        : null,
      recurrenceInterval: normalizeRecurrenceInterval(
        dto.p_recurrence_interval,
      ),
      splitMethod: dto.p_split_method,
    };
  }

  private expenseSetValues(
    dto: CreateExpenseDto,
  ): Partial<typeof schema.expenses.$inferInsert> {
    return {
      amount: String(dto.p_amount),
      assignedUserId: dto.p_assigned_user_id ?? null,
      batchId: dto.p_batch_id ?? null,
      batchName: dto.p_batch_name ?? null,
      budgetId: dto.p_budget_id ?? null,
      categoryId: dto.p_category_id ?? undefined,
      date: new Date(dto.p_date),
      description: dto.p_description,
      isCredit: dto.p_is_credit ?? null,
      isRecurring: dto.p_is_recurring ?? false,
      paidBy: dto.p_paid_by,
      recurrenceEndDate: dto.p_recurrence_end_date
        ? new Date(dto.p_recurrence_end_date)
        : null,
      recurrenceInterval: normalizeRecurrenceInterval(
        dto.p_recurrence_interval,
      ),
      splitMethod: dto.p_split_method,
    };
  }
}
