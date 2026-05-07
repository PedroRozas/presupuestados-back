import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import {
  familyMembers,
  incomes,
  deductions,
  budgets,
  expenses,
  profiles,
  couples,
} from '../database/schema/index.js';
import { filterExpensesForMonth } from '../common/utils/recurrence.js';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private getMonthRange(month: number, year: number) {
    return {
      startDate: new Date(year, month - 1, 1),
      endDate: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }

  private async getExpensesForMonth(
    coupleId: string,
    month: number,
    year: number,
  ) {
    const { startDate, endDate } = this.getMonthRange(month, year);

    const expenseCandidates = await this.db
      .select({
        id: expenses.id,
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
        coupleId: expenses.coupleId,
        batchId: expenses.batchId,
        batchName: expenses.batchName,
        isCredit: expenses.isCredit,
        categoryId: expenses.categoryId,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.coupleId, coupleId),
          or(
            and(
              or(eq(expenses.isRecurring, false), isNull(expenses.isRecurring)),
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
      .orderBy(desc(expenses.date));

    return filterExpensesForMonth(expenseCandidates, month, year);
  }

  private getMembers(coupleId: string) {
    return this.db
      .select({
        id: familyMembers.id,
        name: familyMembers.name,
        coupleId: familyMembers.coupleId,
        linkedUserId: familyMembers.linkedUserId,
      })
      .from(familyMembers)
      .where(eq(familyMembers.coupleId, coupleId));
  }

  private getIncomes(coupleId: string) {
    return this.db
      .select({
        id: incomes.id,
        userId: incomes.userId,
        amount: incomes.amount,
        date: incomes.date,
        description: incomes.description,
        coupleId: incomes.coupleId,
      })
      .from(incomes)
      .where(eq(incomes.coupleId, coupleId));
  }

  private getDeductions(coupleId: string) {
    return this.db
      .select({
        id: deductions.id,
        userId: deductions.userId,
        amount: deductions.amount,
        date: deductions.date,
        description: deductions.description,
        coupleId: deductions.coupleId,
      })
      .from(deductions)
      .where(eq(deductions.coupleId, coupleId));
  }

  private getBudgets(coupleId: string) {
    return this.db
      .select({
        id: budgets.id,
        name: budgets.name,
        type: budgets.type,
        limit: budgets.limit,
        userId: budgets.userId,
        coupleId: budgets.coupleId,
        associatedCard: budgets.associatedCard,
        defaultSplitMethod: budgets.defaultSplitMethod,
      })
      .from(budgets)
      .where(eq(budgets.coupleId, coupleId));
  }

  private getProfile(userId: string) {
    return this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
        phone: profiles.phone,
        coupleId: profiles.coupleId,
        hasSeenOnboarding: profiles.hasSeenOnboarding,
        isPremium: profiles.isPremium,
        defaultSplitMethod: profiles.defaultSplitMethod,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
  }

  private getCouple(coupleId: string) {
    return this.db
      .select({
        id: couples.id,
        inviteCode: couples.inviteCode,
      })
      .from(couples)
      .where(eq(couples.id, coupleId))
      .limit(1);
  }

  /**
   * GET /dashboard
   * Retorna en un solo objeto todos los datos del hogar:
   * members, incomes, deductions, budgets y expenses.
   */
  async getDashboardData(coupleId: string, month: number, year: number) {
    const [members, incomesList, deductionsList, budgetsList, monthExpenses] =
      await Promise.all([
        this.getMembers(coupleId),
        this.getIncomes(coupleId),
        this.getDeductions(coupleId),
        this.getBudgets(coupleId),
        this.getExpensesForMonth(coupleId, month, year),
      ]);

    return {
      members,
      incomes: incomesList,
      deductions: deductionsList,
      budgets: budgetsList,
      expenses: monthExpenses,
    };
  }

  async getBootstrapData(
    user: {
      id: string;
      email: string;
      user_metadata?: {
        name?: string;
        full_name?: string;
      };
    },
    coupleId: string,
    month: number,
    year: number,
  ) {
    const [profileResult, coupleResult, dashboardData] = await Promise.all([
      this.getProfile(user.id),
      this.getCouple(coupleId),
      this.getDashboardData(coupleId, month, year),
    ]);

    return {
      user,
      profile: profileResult[0] ?? null,
      couple: coupleResult[0] ?? null,
      ...dashboardData,
    };
  }

  /**
   * GET /dashboard/summary?month=X&year=Y
   *
   * Calcula el resumen financiero mensual del hogar:
   * ingresos netos, parte de gastos conjuntos y saldo por miembro.
   *
   * Lógica replicada de summaryService.calculateSummary del frontend,
   * incluyendo la expansión de recurrencias monthly, weekly y yearly.
   */
  async getSummary(coupleId: string, month: number, year: number) {
    const [members, allIncomes, allDeductions, monthExpenses] =
      await Promise.all([
        this.getMembers(coupleId),
        this.getIncomes(coupleId),
        this.getDeductions(coupleId),
        this.getExpensesForMonth(coupleId, month, year),
      ]);

    // Solo miembros vinculados a un usuario real
    const linkedMembers = members.filter((m) => m.linkedUserId !== null);
    const equalSplitDivisor = Math.max(linkedMembers.length, 2);

    // Paso 1: calcular ingreso neto por miembro
    const memberData = linkedMembers.map((member) => {
      const memberIncomes = allIncomes.filter((i) => i.userId === member.id);
      const memberDeductions = allDeductions.filter(
        (d) => d.userId === member.id,
      );
      const grossIncome = memberIncomes.reduce(
        (s, i) => s + Number(i.amount),
        0,
      );
      const deductionsTotal = memberDeductions.reduce(
        (s, d) => s + Number(d.amount),
        0,
      );
      return {
        member,
        grossIncome,
        deductionsTotal,
        netIncome: grossIncome - deductionsTotal,
      };
    });

    const totalNetIncome = memberData.reduce((s, m) => s + m.netIncome, 0);

    const jointExpenses = monthExpenses.filter(
      (e) => e.splitMethod !== 'individual',
    );

    const effectiveAmt = (e: (typeof monthExpenses)[number]) => {
      const amt = Number(e.amount);
      return e.isCredit ? -amt : amt;
    };

    const totalJointExpenses = jointExpenses.reduce(
      (s, e) => s + effectiveAmt(e),
      0,
    );
    const totalExpenses = monthExpenses.reduce(
      (s, e) => s + effectiveAmt(e),
      0,
    );

    // Paso 2: calcular parte de cada miembro en los gastos conjuntos
    const userSummaries = memberData.map(
      ({ member, grossIncome, deductionsTotal, netIncome }) => {
        let shareOfJoint = 0;

        for (const expense of jointExpenses) {
          const amt = effectiveAmt(expense);
          if (expense.splitMethod === '50/50') {
            shareOfJoint += amt / equalSplitDivisor;
          } else if (expense.splitMethod === 'proportional') {
            const share =
              totalNetIncome > 0
                ? netIncome / totalNetIncome
                : 1 / equalSplitDivisor;
            shareOfJoint += amt * share;
          }
        }

        const individualTotal = monthExpenses
          .filter(
            (e) =>
              e.splitMethod === 'individual' && e.assignedUserId === member.id,
          )
          .reduce((s, e) => s + effectiveAmt(e), 0);

        return {
          memberId: member.id,
          name: member.name,
          linkedUserId: member.linkedUserId,
          grossIncome,
          deductions: deductionsTotal,
          netIncome,
          shareOfJointExpenses: Math.round(shareOfJoint),
          individualExpenses: Math.round(individualTotal),
          remainingIncome: Math.round(
            netIncome - shareOfJoint - individualTotal,
          ),
        };
      },
    );

    return {
      users: userSummaries,
      totals: {
        totalJointExpenses: Math.round(totalJointExpenses),
        totalExpenses: Math.round(totalExpenses),
        totalNetIncome: Math.round(totalNetIncome),
      },
    };
  }
}
