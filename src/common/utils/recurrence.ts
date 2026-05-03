export interface ExpenseRecurrenceShape {
  date: Date | string;
  isRecurring: boolean | null;
  recurrenceInterval: string | null;
  recurrenceEndDate: Date | string | null;
}

export const normalizeRecurrenceInterval = (
  interval?: string | null,
): string | null => {
  if (!interval) return null;

  const normalized = interval.trim().toLowerCase();

  if (normalized === 'annual') return 'yearly';

  return normalized;
};

export const getPreviousMonthEndDate = (date: Date | string) => {
  const targetDate = new Date(date);

  return new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    0,
    23,
    59,
    59,
    999,
  );
};

export const isExpenseActiveInMonth = (
  expense: ExpenseRecurrenceShape,
  month: number,
  year: number,
) => {
  const expenseDate = new Date(expense.date);
  const expenseStartYear = expenseDate.getFullYear();
  const expenseStartMonth = expenseDate.getMonth() + 1;

  if (
    expenseStartYear > year ||
    (expenseStartYear === year && expenseStartMonth > month)
  ) {
    return false;
  }

  if (expense.recurrenceEndDate) {
    const endDate = new Date(expense.recurrenceEndDate);
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;

    if (endYear < year || (endYear === year && endMonth < month)) {
      return false;
    }
  }

  if (!expense.isRecurring) {
    return expenseStartYear === year && expenseStartMonth === month;
  }

  const recurrenceInterval = normalizeRecurrenceInterval(
    expense.recurrenceInterval,
  );

  if (recurrenceInterval === 'monthly') return true;
  if (recurrenceInterval === 'weekly') return true;
  if (recurrenceInterval === 'yearly') return expenseStartMonth === month;

  return expenseStartYear === year && expenseStartMonth === month;
};

export const filterExpensesForMonth = <T extends ExpenseRecurrenceShape>(
  expenseList: T[],
  month: number,
  year: number,
) =>
  expenseList.filter((expense) => isExpenseActiveInMonth(expense, month, year));
