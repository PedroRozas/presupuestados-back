import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, inArray, desc, gte, lte, isNull, or } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import {
  budgets,
  deductions,
  expenseCategories,
  expenses,
  familyMembers,
  incomes,
} from '../database/schema/index.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { UpdateRecurringExpenseDto } from './dto/update-recurring-expense.dto.js';
import { StopRecurringExpenseDto } from './dto/stop-recurring-expense.dto.js';
import { DeleteExpensesBatchDto } from './dto/delete-expenses-batch.dto.js';
import {
  getPreviousMonthEndDate,
  filterExpensesForMonth,
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

  async getMonthlyExpenseSummary(
    coupleId: string,
    year: number,
    month: number,
    currentMemberId: string | null,
    scope: 'couple' | 'current_user' = 'couple',
  ) {
    const [monthlyExpenses, incomeSummary] = await Promise.all([
      this.getSanitizedMonthlyExpenses(coupleId, year, month),
      this.getIncomeSummary(coupleId),
    ]);

    const splitRatios = new Map(
      incomeSummary.members.map((member) => [
        member.memberRef,
        incomeSummary.totalNetIncome > 0
          ? member.netIncome / incomeSummary.totalNetIncome
          : 0.5,
      ]),
    );
    const currentMemberRef = currentMemberId
      ? await this.getMemberRef(coupleId, currentMemberId)
      : null;

    const scopedExpenses = monthlyExpenses.map((expense) => ({
      ...expense,
      scopedAmount: this.calculateScopedExpenseAmount(
        expense,
        scope,
        currentMemberRef,
        splitRatios,
      ),
    }));

    const totalExpenses = scopedExpenses
      .filter((expense) => !expense.isCredit)
      .reduce((sum, expense) => sum + expense.scopedAmount, 0);
    const totalCredits = scopedExpenses
      .filter((expense) => expense.isCredit)
      .reduce((sum, expense) => sum + expense.scopedAmount, 0);
    const sharedExpenses = scopedExpenses
      .filter(
        (expense) =>
          !expense.isCredit &&
          (expense.splitMethod === '50/50' ||
            expense.splitMethod === 'proportional'),
      )
      .reduce((sum, expense) => sum + expense.scopedAmount, 0);
    const individualExpenses = scopedExpenses
      .filter(
        (expense) => !expense.isCredit && expense.splitMethod === 'individual',
      )
      .reduce((sum, expense) => sum + expense.scopedAmount, 0);

    const categoryMap = new Map<string, { amount: number; count: number }>();
    for (const expense of scopedExpenses) {
      if (expense.isCredit || expense.scopedAmount <= 0) continue;
      const current = categoryMap.get(expense.categoryName) ?? {
        amount: 0,
        count: 0,
      };
      current.amount += expense.scopedAmount;
      current.count += 1;
      categoryMap.set(expense.categoryName, current);
    }

    const largestExpense = scopedExpenses
      .filter((expense) => !expense.isCredit && expense.scopedAmount > 0)
      .sort((a, b) => b.scopedAmount - a.scopedAmount)[0];

    return {
      period: this.formatPeriod(year, month),
      scope,
      currency: 'CLP',
      totalExpenses: Math.round(totalExpenses),
      totalCredits: Math.round(totalCredits),
      netExpenses: Math.round(totalExpenses - totalCredits),
      sharedExpenses: Math.round(sharedExpenses),
      individualExpenses: Math.round(individualExpenses),
      expensesCount: scopedExpenses.filter(
        (expense) => expense.scopedAmount > 0,
      ).length,
      topCategories: [...categoryMap.entries()]
        .map(([name, value]) => ({
          name,
          amount: Math.round(value.amount),
          count: value.count,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8),
      largestExpense: largestExpense
        ? {
            ref: largestExpense.ref,
            description: largestExpense.description,
            amount: Math.round(largestExpense.scopedAmount),
            date: largestExpense.date,
            categoryName: largestExpense.categoryName,
          }
        : null,
    };
  }

  async searchMonthlyExpenses(
    coupleId: string,
    year: number,
    month: number,
    currentMemberId: string | null,
    options: {
      scope?: 'couple' | 'current_user';
      limit?: number;
      categoryName?: string;
      query?: string;
      splitMethod?: '50/50' | 'proportional' | 'individual';
    } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 30);
    const scope = options.scope ?? 'couple';
    const [monthlyExpenses, incomeSummary] = await Promise.all([
      this.getSanitizedMonthlyExpenses(coupleId, year, month),
      this.getIncomeSummary(coupleId),
    ]);
    const currentMemberRef = currentMemberId
      ? await this.getMemberRef(coupleId, currentMemberId)
      : null;
    const splitRatios = new Map(
      incomeSummary.members.map((member) => [
        member.memberRef,
        incomeSummary.totalNetIncome > 0
          ? member.netIncome / incomeSummary.totalNetIncome
          : 0.5,
      ]),
    );
    const categoryFilter = options.categoryName?.toLowerCase();
    const queryFilter = options.query?.toLowerCase();

    const filtered = monthlyExpenses
      .map((expense) => ({
        ...expense,
        scopedAmount: this.calculateScopedExpenseAmount(
          expense,
          scope,
          currentMemberRef,
          splitRatios,
        ),
      }))
      .filter((expense) => expense.scopedAmount > 0)
      .filter((expense) =>
        categoryFilter
          ? expense.categoryName.toLowerCase().includes(categoryFilter)
          : true,
      )
      .filter((expense) =>
        queryFilter
          ? expense.description.toLowerCase().includes(queryFilter)
          : true,
      )
      .filter((expense) =>
        options.splitMethod
          ? expense.splitMethod === options.splitMethod
          : true,
      );

    return {
      period: this.formatPeriod(year, month),
      scope,
      limit,
      hasMore: filtered.length > limit,
      expenses: filtered.slice(0, limit).map((expense) => ({
        ref: expense.ref,
        date: expense.date,
        description: expense.description,
        amount: Math.round(expense.scopedAmount),
        originalAmount: expense.amount,
        categoryName: expense.categoryName,
        paidByName: expense.paidByName,
        assignedToName: expense.assignedToName,
        splitMethod: expense.splitMethod,
        isCredit: expense.isCredit,
      })),
    };
  }

  async getLargestExpenses(
    coupleId: string,
    year: number,
    month: number,
    currentMemberId: string | null,
    scope: 'couple' | 'current_user' = 'couple',
    limit = 5,
  ) {
    const result = await this.searchMonthlyExpenses(
      coupleId,
      year,
      month,
      currentMemberId,
      {
        scope,
        limit: Math.min(Math.max(limit, 1), 10),
      },
    );

    return {
      ...result,
      expenses: result.expenses.sort((a, b) => b.amount - a.amount),
    };
  }

  async getCategoryBreakdown(
    coupleId: string,
    year: number,
    month: number,
    currentMemberId: string | null,
    scope: 'couple' | 'current_user' = 'couple',
    limit = 10,
  ) {
    const summary = await this.getMonthlyExpenseSummary(
      coupleId,
      year,
      month,
      currentMemberId,
      scope,
    );

    return {
      period: summary.period,
      scope,
      currency: 'CLP',
      categories: summary.topCategories.slice(
        0,
        Math.min(Math.max(limit, 1), 12),
      ),
    };
  }

  async getIncomeSummary(coupleId: string) {
    const [members, incomeRows, deductionRows] = await Promise.all([
      this.db
        .select({
          id: familyMembers.id,
          name: familyMembers.name,
        })
        .from(familyMembers)
        .where(eq(familyMembers.coupleId, coupleId)),
      this.db
        .select({
          userId: incomes.userId,
          amount: incomes.amount,
          description: incomes.description,
        })
        .from(incomes)
        .where(eq(incomes.coupleId, coupleId)),
      this.db
        .select({
          userId: deductions.userId,
          amount: deductions.amount,
          description: deductions.description,
        })
        .from(deductions)
        .where(eq(deductions.coupleId, coupleId)),
    ]);

    const refsById = new Map(
      members.map((member, index) => [member.id, `member_${index + 1}`]),
    );
    const namesById = new Map(
      members.map((member) => [member.id, member.name]),
    );

    const memberSummaries = members.map((member, index) => {
      const grossIncome = incomeRows
        .filter((income) => income.userId === member.id)
        .reduce((sum, income) => sum + Number(income.amount), 0);
      const deductionTotal = deductionRows
        .filter((deduction) => deduction.userId === member.id)
        .reduce((sum, deduction) => sum + Number(deduction.amount), 0);

      return {
        memberRef: refsById.get(member.id) ?? `member_${index + 1}`,
        memberName: member.name,
        grossIncome: Math.round(grossIncome),
        deductions: Math.round(deductionTotal),
        netIncome: Math.round(grossIncome - deductionTotal),
      };
    });

    return {
      currency: 'CLP',
      members: memberSummaries,
      totalGrossIncome: memberSummaries.reduce(
        (sum, member) => sum + member.grossIncome,
        0,
      ),
      totalDeductions: memberSummaries.reduce(
        (sum, member) => sum + member.deductions,
        0,
      ),
      totalNetIncome: memberSummaries.reduce(
        (sum, member) => sum + member.netIncome,
        0,
      ),
      incomeItems: incomeRows.map((income) => ({
        memberRef: refsById.get(income.userId) ?? 'member_unknown',
        memberName: namesById.get(income.userId) ?? 'Sin nombre',
        description: income.description ?? 'Ingreso',
        grossAmount: Math.round(Number(income.amount)),
      })),
      deductionItems: deductionRows.map((deduction) => ({
        memberRef: refsById.get(deduction.userId) ?? 'member_unknown',
        memberName: namesById.get(deduction.userId) ?? 'Sin nombre',
        description: deduction.description ?? 'Deducción',
        amount: Math.round(Number(deduction.amount)),
      })),
    };
  }

  async getBudgetStatus(coupleId: string, year: number, month: number) {
    const [budgetRows, monthlyExpenses] = await Promise.all([
      this.db
        .select({
          id: budgets.id,
          name: budgets.name,
          type: budgets.type,
          limit: budgets.limit,
        })
        .from(budgets)
        .where(eq(budgets.coupleId, coupleId))
        .orderBy(budgets.name),
      this.getSanitizedMonthlyExpenses(coupleId, year, month),
    ]);

    return {
      period: this.formatPeriod(year, month),
      currency: 'CLP',
      budgets: budgetRows.map((budget, index) => {
        const totalSpent = monthlyExpenses
          .filter((expense) => expense.budgetRef === `budget_${index + 1}`)
          .filter((expense) => !expense.isCredit)
          .reduce((sum, expense) => sum + expense.amount, 0);
        const limit = Number(budget.limit);
        return {
          budgetRef: `budget_${index + 1}`,
          name: budget.name,
          type: budget.type,
          limit: Math.round(limit),
          totalSpent: Math.round(totalSpent),
          remaining: Math.round(Math.max(0, limit - totalSpent)),
          percentage:
            limit > 0 ? Math.round((totalSpent / limit) * 1000) / 10 : 0,
        };
      }),
    };
  }

  async compareMonths(
    coupleId: string,
    first: { year: number; month: number },
    second: { year: number; month: number },
    currentMemberId: string | null,
    scope: 'couple' | 'current_user' = 'couple',
  ) {
    const [firstSummary, secondSummary] = await Promise.all([
      this.getMonthlyExpenseSummary(
        coupleId,
        first.year,
        first.month,
        currentMemberId,
        scope,
      ),
      this.getMonthlyExpenseSummary(
        coupleId,
        second.year,
        second.month,
        currentMemberId,
        scope,
      ),
    ]);

    return {
      scope,
      currency: 'CLP',
      first: firstSummary,
      second: secondSummary,
      netExpenseDifference:
        secondSummary.netExpenses - firstSummary.netExpenses,
      percentageChange:
        firstSummary.netExpenses > 0
          ? Math.round(
              ((secondSummary.netExpenses - firstSummary.netExpenses) /
                firstSummary.netExpenses) *
                1000,
            ) / 10
          : null,
    };
  }

  async getCashflowSummary(
    coupleId: string,
    year: number,
    month: number,
    currentMemberId: string | null,
    scope: 'couple' | 'current_user' = 'couple',
  ) {
    const [incomeSummary, monthlyExpenses] = await Promise.all([
      this.getIncomeSummary(coupleId),
      this.getSanitizedMonthlyExpenses(coupleId, year, month),
    ]);
    const currentMemberRef = currentMemberId
      ? await this.getMemberRef(coupleId, currentMemberId)
      : null;

    const splitRatios = new Map(
      incomeSummary.members.map((member) => [
        member.memberRef,
        incomeSummary.totalNetIncome > 0
          ? member.netIncome / incomeSummary.totalNetIncome
          : 0.5,
      ]),
    );

    const memberCashflows = incomeSummary.members.map((member) => {
      let shareOfJointExpenses = 0;
      let individualExpenses = 0;

      for (const expense of monthlyExpenses) {
        const amount = expense.isCredit ? -expense.amount : expense.amount;

        if (expense.splitMethod === 'individual') {
          if (expense.assignedToRef === member.memberRef) {
            individualExpenses += amount;
          }
          continue;
        }

        if (expense.splitMethod === 'proportional') {
          shareOfJointExpenses +=
            amount * (splitRatios.get(member.memberRef) ?? 0.5);
        } else {
          shareOfJointExpenses += amount / 2;
        }
      }

      const netExpenses = shareOfJointExpenses + individualExpenses;

      return {
        memberRef: member.memberRef,
        memberName: member.memberName,
        netIncome: member.netIncome,
        incomeSharePercent:
          incomeSummary.totalNetIncome > 0
            ? Math.round(
                (member.netIncome / incomeSummary.totalNetIncome) * 1000,
              ) / 10
            : 50,
        shareOfJointExpenses: Math.round(shareOfJointExpenses),
        individualExpenses: Math.round(individualExpenses),
        netExpenses: Math.round(netExpenses),
        estimatedRemainder: Math.round(member.netIncome - netExpenses),
      };
    });

    const selectedCashflows =
      scope === 'current_user' && currentMemberId
        ? memberCashflows.filter(
            (member) => member.memberRef === currentMemberRef,
          )
        : memberCashflows;

    const cashflows =
      selectedCashflows.length > 0 ? selectedCashflows : memberCashflows;

    const netIncome = cashflows.reduce(
      (sum, member) => sum + member.netIncome,
      0,
    );
    const netExpenses = cashflows.reduce(
      (sum, member) => sum + member.netExpenses,
      0,
    );

    return {
      period: this.formatPeriod(year, month),
      scope,
      currency: 'CLP',
      netIncome,
      netExpenses,
      estimatedRemainder: netIncome - netExpenses,
      cashflowByMember: cashflows,
      incomeSummary: cashflows.map((member) => ({
        memberRef: member.memberRef,
        memberName: member.memberName,
        netIncome: member.netIncome,
        incomeSharePercent: member.incomeSharePercent,
      })),
    };
  }

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

  async getIncomes(coupleId: string) {
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

  private async getSanitizedMonthlyExpenses(
    coupleId: string,
    year: number,
    month: number,
  ) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const [expenseCandidates, categories, members, budgetRows] =
      await Promise.all([
        this.db
          .select({
            amount: expenses.amount,
            date: expenses.date,
            description: expenses.description,
            isRecurring: expenses.isRecurring,
            recurrenceInterval: expenses.recurrenceInterval,
            recurrenceEndDate: expenses.recurrenceEndDate,
            splitMethod: expenses.splitMethod,
            paidBy: expenses.paidBy,
            assignedUserId: expenses.assignedUserId,
            budgetId: expenses.budgetId,
            isCredit: expenses.isCredit,
            categoryId: expenses.categoryId,
          })
          .from(expenses)
          .where(
            and(
              eq(expenses.coupleId, coupleId),
              or(
                and(
                  or(
                    eq(expenses.isRecurring, false),
                    isNull(expenses.isRecurring),
                  ),
                  gte(expenses.date, startDate),
                  lte(expenses.date, endDate),
                ),
                and(
                  eq(expenses.isRecurring, true),
                  lte(expenses.date, endDate),
                  or(
                    isNull(expenses.recurrenceEndDate),
                    gte(expenses.recurrenceEndDate, startDate),
                  ),
                ),
              ),
            ),
          )
          .orderBy(desc(expenses.date)),
        this.db.select().from(expenseCategories),
        this.db
          .select({ id: familyMembers.id, name: familyMembers.name })
          .from(familyMembers)
          .where(eq(familyMembers.coupleId, coupleId)),
        this.db
          .select({ id: budgets.id, name: budgets.name })
          .from(budgets)
          .where(eq(budgets.coupleId, coupleId))
          .orderBy(budgets.name),
      ]);

    const rows = filterExpensesForMonth(expenseCandidates, month, year);

    const categoryNames = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const memberRefs = new Map(
      members.map((member, index) => [member.id, `member_${index + 1}`]),
    );
    const memberNames = new Map(
      members.map((member) => [member.id, member.name]),
    );
    const budgetRefs = new Map(
      budgetRows.map((budget, index) => [budget.id, `budget_${index + 1}`]),
    );

    return rows.map((expense, index) => ({
      ref: `expense_${index + 1}`,
      date: this.formatDate(expense.date),
      description: expense.description.replace(/\s+/g, ' ').trim(),
      amount: Math.round(Number(expense.amount)),
      categoryName:
        categoryNames.get(expense.categoryId ?? 0) ?? 'Sin categoría',
      paidByRef: memberRefs.get(expense.paidBy) ?? null,
      paidByName: memberNames.get(expense.paidBy) ?? null,
      assignedToRef: expense.assignedUserId
        ? (memberRefs.get(expense.assignedUserId) ?? null)
        : null,
      assignedToName: expense.assignedUserId
        ? (memberNames.get(expense.assignedUserId) ?? null)
        : null,
      budgetRef: expense.budgetId
        ? (budgetRefs.get(expense.budgetId) ?? null)
        : null,
      splitMethod: expense.splitMethod as
        | '50/50'
        | 'proportional'
        | 'individual',
      isCredit: Boolean(expense.isCredit),
    }));
  }

  private async getMemberRef(coupleId: string, memberId: string) {
    const members = await this.db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.coupleId, coupleId));

    const index = members.findIndex((member) => member.id === memberId);
    return index >= 0 ? `member_${index + 1}` : null;
  }

  private calculateScopedExpenseAmount(
    expense: {
      amount: number;
      isCredit: boolean;
      splitMethod: '50/50' | 'proportional' | 'individual';
      assignedToRef: string | null;
    },
    scope: 'couple' | 'current_user',
    currentMemberRef: string | null,
    splitRatios: Map<string, number>,
  ) {
    if (scope === 'couple') return expense.amount;
    if (!currentMemberRef) return 0;

    if (expense.splitMethod === 'individual') {
      return expense.assignedToRef === currentMemberRef ? expense.amount : 0;
    }

    if (expense.splitMethod === 'proportional') {
      return expense.amount * (splitRatios.get(currentMemberRef) ?? 0.5);
    }

    return expense.amount / 2;
  }

  private formatPeriod(year: number, month: number) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  private formatDate(date: Date) {
    return date.toISOString().split('T')[0];
  }
}
