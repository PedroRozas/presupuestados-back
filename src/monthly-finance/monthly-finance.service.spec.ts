import { MonthlyFinanceService } from './monthly-finance.service'
import { monthlyIncomes } from '../database/schema/index.js'

interface RecordedOp {
  kind: 'insert' | 'delete'
  table: unknown
  values?: unknown
}

const createDbMock = (selectResults: unknown[][], ops: RecordedOp[]) => {
  let selectCall = 0
  const db: any = {
    select: () => ({
      from: () => ({
        where: async () => selectResults[selectCall++] ?? [],
      }),
    }),
    insert: (t: unknown) => ({
      values: (values: unknown) => {
        ops.push({ kind: 'insert', table: t, values })
        return { returning: async () => (Array.isArray(values) ? values : [values]) }
      },
    }),
    delete: (t: unknown) => ({
      where: async () => {
        ops.push({ kind: 'delete', table: t })
        return []
      },
    }),
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  }
  return db
}

describe('MonthlyFinanceService.personalize', () => {
  it('clona los ingresos globales a monthly_incomes cuando el mes no está personalizado', async () => {
    const ops: RecordedOp[] = []
    const globals = [
      { userId: 'A', amount: '100', description: 'Sueldo' },
    ]
    const db = createDbMock([[], globals], ops)
    const service = new MonthlyFinanceService(db)

    await service.personalize('couple-1', 'owner-1', 7, 2026, 'incomes')

    const insert = ops.find((o) => o.kind === 'insert' && o.table === monthlyIncomes)
    expect(insert).toBeDefined()
    const inserted = insert!.values as Array<{ coupleId: string; month: number; year: number; userId: string }>
    expect(inserted[0].coupleId).toBe('couple-1')
    expect(inserted[0].month).toBe(7)
    expect(inserted[0].year).toBe(2026)
    expect(inserted[0].userId).toBe('A')
  })

  it('es idempotente: si ya hay overrides, no inserta', async () => {
    const ops: RecordedOp[] = []
    const db = createDbMock([[{ id: 'x', userId: 'A' }]], ops)
    const service = new MonthlyFinanceService(db)

    await service.personalize('couple-1', 'owner-1', 7, 2026, 'incomes')

    expect(ops.find((o) => o.kind === 'insert')).toBeUndefined()
  })
})
