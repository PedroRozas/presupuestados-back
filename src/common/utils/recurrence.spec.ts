import {
  filterExpensesForMonth,
  getPreviousMonthEndDate,
  normalizeRecurrenceInterval,
} from './recurrence'

describe('recurrence utils', () => {
  it('normalizes annual to yearly', () => {
    expect(normalizeRecurrenceInterval('annual')).toBe('yearly')
    expect(normalizeRecurrenceInterval('yearly')).toBe('yearly')
  })

  it('calculates the last day of the previous month from the new start date', () => {
    const cutoffDate = getPreviousMonthEndDate('2026-03-31T15:00:00.000Z')

    expect(cutoffDate.getFullYear()).toBe(2026)
    expect(cutoffDate.getMonth()).toBe(1)
    expect(cutoffDate.getDate()).toBe(28)
  })

  it('keeps a recurring expense active in april after editing it on march 31', () => {
    const expenses = [
      {
        date: '2026-01-15T15:00:00.000Z',
        isRecurring: true,
        recurrenceInterval: 'monthly',
        recurrenceEndDate: '2026-02-28T23:59:59.999Z',
      },
      {
        date: '2026-03-31T15:00:00.000Z',
        isRecurring: true,
        recurrenceInterval: 'monthly',
        recurrenceEndDate: null,
      },
    ]

    expect(filterExpensesForMonth(expenses, 3, 2026)).toHaveLength(1)
    expect(filterExpensesForMonth(expenses, 4, 2026)).toHaveLength(1)
    expect(filterExpensesForMonth(expenses, 4, 2026)[0]?.date).toBe(
      '2026-03-31T15:00:00.000Z',
    )
  })

  it('supports weekly and yearly intervals in monthly projections', () => {
    const expenses = [
      {
        date: '2026-03-10T15:00:00.000Z',
        isRecurring: true,
        recurrenceInterval: 'weekly',
        recurrenceEndDate: null,
      },
      {
        date: '2025-04-05T15:00:00.000Z',
        isRecurring: true,
        recurrenceInterval: 'annual',
        recurrenceEndDate: null,
      },
    ]

    expect(filterExpensesForMonth(expenses, 4, 2026)).toHaveLength(2)
  })
})
