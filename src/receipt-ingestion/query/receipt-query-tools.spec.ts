import { ReceiptQueryTools } from './receipt-query-tools.js';
import type { ReceiptQueryRepository } from '../repository/receipt-query.repository.js';

const build = () => {
  const queries = {
    summaryForMonth: jest.fn(() =>
      Promise.resolve({
        total: '12000',
        receiptCount: 2,
        byCategory: [
          { category: 'lacteos_huevos', amount: '5000', itemCount: 3 },
        ],
      }),
    ),
    topProducts: jest.fn(() =>
      Promise.resolve([{ name: 'Leche', amount: '3000', itemCount: 3 }]),
    ),
    categorySpend: jest.fn(() =>
      Promise.resolve([
        { month: '2026-08', amount: '1000', itemCount: 1 },
        { month: '2026-09', amount: '2500', itemCount: 2 },
      ]),
    ),
    searchItems: jest.fn(() =>
      Promise.resolve([
        {
          description: 'LECHE 1L',
          productName: 'Leche entera 1L',
          amount: '1200',
          receiptDate: '2026-09-03',
          merchantName: 'Jumbo',
        },
      ]),
    ),
  };
  const tools = new ReceiptQueryTools(
    queries as unknown as ReceiptQueryRepository,
  );
  return { tools, queries };
};

const call = (name: string, args: unknown) => ({
  callId: 'call_1',
  name,
  argumentsJson: typeof args === 'string' ? args : JSON.stringify(args),
});

describe('ReceiptQueryTools', () => {
  it('expone cuatro definiciones con JSON Schema estricto', () => {
    const { tools } = build();
    const definitions = tools.definitions();
    expect(definitions.map((d) => d.name)).toEqual([
      'get_month_summary',
      'get_top_products',
      'get_category_spend',
      'search_items',
    ]);
    for (const definition of definitions) {
      expect(definition.parametersJsonSchema['additionalProperties']).toBe(
        false,
      );
    }
  });

  it('devuelve unknown_tool sin tocar el repositorio', async () => {
    const { tools, queries } = build();
    const result = await tools.execute('c1', call('drop_table', {}));
    expect(result).toEqual(expect.objectContaining({ error: 'unknown_tool' }));
    expect(queries.summaryForMonth).not.toHaveBeenCalled();
  });

  it('devuelve invalid_arguments para JSON roto o argumentos fuera de rango', async () => {
    const { tools, queries } = build();
    const broken = await tools.execute(
      'c1',
      call('get_month_summary', '{oops'),
    );
    const outOfRange = await tools.execute(
      'c1',
      call('get_month_summary', { year: 2026, month: 13 }),
    );
    expect(broken).toEqual(
      expect.objectContaining({ error: 'invalid_arguments' }),
    );
    const outOfRangeError = outOfRange as { error: string; detail: string };
    expect(outOfRangeError.error).toBe('invalid_arguments');
    expect(outOfRangeError.detail).toContain('month');
    expect(queries.summaryForMonth).not.toHaveBeenCalled();
  });

  it('get_month_summary consulta con coupleId y convierte montos a número', async () => {
    const { tools, queries } = build();
    const result = await tools.execute(
      'c1',
      call('get_month_summary', { year: 2026, month: 9 }),
    );
    expect(queries.summaryForMonth).toHaveBeenCalledWith('c1', 2026, 9);
    expect(result).toEqual({
      total: 12000,
      receiptCount: 2,
      byCategory: [{ category: 'lacteos_huevos', amount: 5000, itemCount: 3 }],
    });
  });

  it('get_top_products usa el límite por defecto cuando limit es null', async () => {
    const { tools, queries } = build();
    await tools.execute(
      'c1',
      call('get_top_products', { year: 2026, month: 9, limit: null }),
    );
    expect(queries.topProducts).toHaveBeenCalledWith('c1', 2026, 9, 10);
  });

  it('get_category_spend suma el total de los meses devueltos', async () => {
    const { tools, queries } = build();
    const result = await tools.execute(
      'c1',
      call('get_category_spend', {
        category: 'lacteos_huevos',
        from: '2026-08-01',
        to: '2026-09-30',
      }),
    );
    expect(queries.categorySpend).toHaveBeenCalledWith(
      'c1',
      'lacteos_huevos',
      '2026-08-01',
      '2026-09-30',
    );
    expect(result).toEqual({
      category: 'lacteos_huevos',
      total: 3500,
      byMonth: [
        { month: '2026-08', amount: 1000, itemCount: 1 },
        { month: '2026-09', amount: 2500, itemCount: 2 },
      ],
    });
  });

  it('search_items recorta el texto y prefiere el nombre canónico', async () => {
    const { tools, queries } = build();
    const result = await tools.execute(
      'c1',
      call('search_items', { text: ' leche ', year: 2026, month: 9 }),
    );
    expect(queries.searchItems).toHaveBeenCalledWith(
      'c1',
      'leche',
      2026,
      9,
      20,
    );
    expect(result).toEqual({
      items: [
        {
          description: 'Leche entera 1L',
          amount: 1200,
          date: '2026-09-03',
          merchant: 'Jumbo',
        },
      ],
    });
  });
});
