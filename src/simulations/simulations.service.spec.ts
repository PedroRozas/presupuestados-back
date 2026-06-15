import { SimulationsService } from './simulations.service';
import { expenses, incomes } from '../database/schema/index.js';

interface RecordedOp {
  kind: 'insert' | 'update' | 'delete';
  table: unknown;
  values?: unknown;
  where?: unknown;
}

const createTxMock = (ops: RecordedOp[]) => ({
  insert: (table: unknown) => ({
    values: (values: unknown) => {
      ops.push({ kind: 'insert', table, values });
      return { returning: async () => [values] };
    },
  }),
  update: (table: unknown) => ({
    set: (values: unknown) => ({
      where: (where: unknown) => {
        ops.push({ kind: 'update', table, values, where });
        return { returning: async () => [values] };
      },
    }),
  }),
  delete: (table: unknown) => ({
    where: (where: unknown) => {
      ops.push({ kind: 'delete', table, where });
      return { returning: async () => [] };
    },
  }),
});

const emptyDto = () => ({
  incomes: { created: [] as unknown[], updated: [] as unknown[], deletedIds: [] as string[] },
  deductions: { created: [] as unknown[], updated: [] as unknown[], deletedIds: [] as string[] },
  budgets: { created: [] as unknown[], updated: [] as unknown[], deletedIds: [] as string[] },
  expenses: { created: [] as unknown[], updated: [] as unknown[], split: [] as unknown[], deletedIds: [] as string[], stopped: [] as unknown[] },
});

const buildService = (ops: RecordedOp[]) => {
  const db = {
    transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb(createTxMock(ops)),
  };
  return new SimulationsService(db as never);
};

describe('SimulationsService.apply', () => {
  it('inserta un income creado', async () => {
    const ops: RecordedOp[] = [];
    const service = buildService(ops);
    const dto = emptyDto();
    dto.incomes.created = [
      {
        id: 'inc-1',
        user_id: 'member-1',
        amount: 1000,
        description: 'Sueldo',
        date: '2026-07-01T12:00:00.000Z',
      },
    ];

    await service.apply('couple-1', 'owner-1', dto as never);

    const insert = ops.find((o) => o.kind === 'insert' && o.table === incomes);
    expect(insert).toBeDefined();
    expect((insert!.values as { id: string }).id).toBe('inc-1');
    expect((insert!.values as { coupleId: string }).coupleId).toBe('couple-1');
  });

  it('para un recurrente editado (split): corta el viejo e inserta uno nuevo', async () => {
    const ops: RecordedOp[] = [];
    const service = buildService(ops);
    const dto = emptyDto();
    dto.expenses.split = [
      {
        p_old_expense_id: 'exp-old',
        p_new_expense: {
          p_expense_id: 'ignored-by-backend',
          p_amount: 250,
          p_date: '2026-07-01T12:00:00.000Z',
          p_description: 'Arriendo',
          p_is_recurring: true,
          p_recurrence_interval: 'monthly',
          p_split_method: '50/50',
          p_paid_by: 'member-1',
        },
      },
    ];

    await service.apply('couple-1', 'owner-1', dto as never);

    const expenseOps = ops.filter((o) => o.table === expenses);
    const update = expenseOps.find((o) => o.kind === 'update');
    const insert = expenseOps.find((o) => o.kind === 'insert');
    expect(update).toBeDefined();
    expect((update!.values as { recurrenceEndDate: Date }).recurrenceEndDate)
      .toBeInstanceOf(Date);
    expect(insert).toBeDefined();
    expect((insert!.values as { isRecurring: boolean }).isRecurring).toBe(true);
    expect((insert!.values as { recurrenceEndDate: unknown }).recurrenceEndDate)
      .toBeNull();
  });

  it('para un recurrente eliminado (stop): setea recurrenceEndDate', async () => {
    const ops: RecordedOp[] = [];
    const service = buildService(ops);
    const dto = emptyDto();
    dto.expenses.stopped = [
      { p_expense_id: 'exp-rec', p_end_date: '2026-06-30T23:59:59.999Z' },
    ];

    await service.apply('couple-1', 'owner-1', dto as never);

    const update = ops.find((o) => o.kind === 'update' && o.table === expenses);
    expect(update).toBeDefined();
    expect((update!.values as { recurrenceEndDate: Date }).recurrenceEndDate)
      .toBeInstanceOf(Date);
  });

  it('aplica el filtro de coupleId al actualizar un income', async () => {
    const ops: RecordedOp[] = [];
    const service = buildService(ops);
    const dto = emptyDto();
    dto.incomes.updated = [
      {
        id: 'inc-9',
        user_id: 'member-1',
        amount: 2000,
        description: 'Ajuste',
        date: '2026-07-01T12:00:00.000Z',
      },
    ];

    await service.apply('couple-XYZ', 'owner-1', dto as never);

    const update = ops.find((o) => o.kind === 'update' && o.table === incomes);
    expect(update).toBeDefined();
    expect(update!.where).toBeDefined();
  });
});
