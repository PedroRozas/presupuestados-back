import { currentPeriodMonth } from './period-month.js';

describe('currentPeriodMonth', () => {
  it('usa la zona horaria para decidir el mes', () => {
    expect(
      currentPeriodMonth(
        new Date('2026-10-01T02:30:00.000Z'),
        'America/Santiago',
      ),
    ).toBe('2026-09-01');
    expect(
      currentPeriodMonth(new Date('2026-10-01T02:30:00.000Z'), 'UTC'),
    ).toBe('2026-10-01');
  });

  it('rellena el mes con dos dígitos', () => {
    expect(
      currentPeriodMonth(new Date('2026-03-15T12:00:00.000Z'), 'UTC'),
    ).toBe('2026-03-01');
  });
});
