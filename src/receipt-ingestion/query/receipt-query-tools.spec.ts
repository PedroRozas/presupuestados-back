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
    listCategoryItems: jest.fn(() =>
      Promise.resolve([
        {
          description: 'LECHE ENTERA 1L',
          productName: 'Leche entera 1L',
          amount: '3200',
          receiptDate: '2026-09-03',
          merchantName: 'Jumbo',
        },
        {
          description: 'HUEVOS 12U',
          productName: null,
          amount: '4230',
          receiptDate: '2026-09-07',
          merchantName: 'Líder',
        },
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
    searchReceipts: jest.fn().mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        merchant: 'LIDER',
        date: '2026-09-09',
        total: '83665',
        status: 'ready',
        itemCount: 30,
        reviewReasons: [],
      },
    ]),
    receiptDetail: jest.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      merchant: 'LIDER',
      date: '2026-09-09',
      total: '83665',
      status: 'ready',
      itemCount: 30,
      reviewReasons: [],
      items: Array.from({ length: 30 }, (_, index) => ({
        description: `Producto ${index + 1}`,
        quantity: '1',
        unitPrice: '1000',
        amount: '1000',
      })),
    }),
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
  it('expone las consultas de productos y boletas con JSON Schema estricto', () => {
    const { tools } = build();
    const definitions = tools.definitions();
    expect(definitions.map((d) => d.name)).toEqual([
      'get_month_summary',
      'get_top_products',
      'get_category_spend',
      'list_category_items',
      'search_items',
      'search_receipts',
      'get_receipt_detail',
    ]);
    for (const definition of definitions) {
      expect(definition.parametersJsonSchema['additionalProperties']).toBe(
        false,
      );
      expect(
        [...(definition.parametersJsonSchema['required'] as string[])].sort(),
      ).toEqual(
        Object.keys(
          definition.parametersJsonSchema['properties'] as Record<
            string,
            unknown
          >,
        ).sort(),
      );
    }
  });

  it('busca por comercio y devuelve identificadores para consultar el detalle', async () => {
    const { tools, queries } = build();
    const result = await tools.execute(
      'c1',
      call('search_receipts', { text: ' Lider ', year: 2026, month: 9 }),
    );
    expect(queries.searchReceipts).toHaveBeenCalledWith(
      'c1',
      'Lider',
      2026,
      9,
      11,
      0,
    );
    expect(result).toEqual({
      receipts: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          merchant: 'LIDER',
          date: '2026-09-09',
          total: 83665,
          status: 'ready',
          itemCount: 30,
          reviewReasons: [],
        },
      ],
      hasMore: false,
      nextOffset: null,
    });
  });

  it('devuelve los 30 ítems sin aplicar el límite de búsqueda de productos', async () => {
    const { tools, queries } = build();
    const result = await tools.execute(
      'c1',
      call('get_receipt_detail', {
        receiptId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    expect(queries.receiptDetail).toHaveBeenCalledWith(
      'c1',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toMatchObject({
      receipt: {
        merchant: 'LIDER',
        total: 83665,
        itemCount: 30,
      },
    });
    const receipt = (result as { receipt: { items: unknown[] } }).receipt;
    expect(receipt.items).toHaveLength(30);
    expect(receipt.items[29]).toEqual({
      description: 'Producto 30',
      quantity: 1,
      unitPrice: 1000,
      amount: 1000,
    });
  });

  it('devuelve receipt null si no existe o no pertenece al hogar', async () => {
    const { tools, queries } = build();
    queries.receiptDetail.mockResolvedValueOnce(null);
    expect(
      await tools.execute(
        'c1',
        call('get_receipt_detail', {
          receiptId: '11111111-1111-4111-8111-111111111111',
        }),
      ),
    ).toEqual({ receipt: null });
  });

  it('muestra descuentos de boletas antiguas en el producto anterior conservando cantidades y total', async () => {
    const { tools, queries } = build();
    queries.receiptDetail.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      merchant: 'LIDER',
      date: '2026-09-09',
      total: '10990',
      status: 'ready',
      itemCount: 6,
      reviewReasons: [],
      items: [
        {
          description: 'GAS COLA DES ZERO',
          quantity: '2',
          unitPrice: '2750',
          amount: '5500',
        },
        {
          description: 'RF Lleve N x',
          quantity: null,
          unitPrice: null,
          amount: '-1500',
        },
        {
          description: 'REBOZADO STEAK',
          quantity: null,
          unitPrice: null,
          amount: '2360',
        },
        {
          description: 'RF Lleve N x',
          quantity: null,
          unitPrice: null,
          amount: '-360',
        },
        {
          description: 'FILE POLLO',
          quantity: '0.5',
          unitPrice: '12780',
          amount: '6390',
        },
        {
          description: 'RF Precio Antes Ahora',
          quantity: null,
          unitPrice: null,
          amount: '-1400',
        },
      ],
    });
    expect(
      await tools.execute(
        'c1',
        call('get_receipt_detail', {
          receiptId: '11111111-1111-4111-8111-111111111111',
        }),
      ),
    ).toMatchObject({
      receipt: {
        total: 10990,
        itemCount: 3,
        adjustments: [],
        items: [
          {
            description: 'GAS COLA DES ZERO',
            quantity: 2,
            unitPrice: 2750,
            amount: 4000,
          },
          {
            description: 'REBOZADO STEAK',
            quantity: null,
            unitPrice: null,
            amount: 2000,
          },
          {
            description: 'FILE POLLO',
            quantity: 0.5,
            unitPrice: 12780,
            amount: 4990,
          },
        ],
      },
    });
  });

  it('rechaza búsquedas vacías e identificadores inválidos antes de consultar', async () => {
    const { tools, queries } = build();
    for (const request of [
      call('search_receipts', { text: ' ', year: 2026, month: 9 }),
      call('get_receipt_detail', { receiptId: 'otro-hogar' }),
      call('search_receipts', {
        text: 'Lider',
        year: 2026,
        month: 9,
        offset: -1,
      }),
      call('search_receipts', {
        text: 'Lider',
        year: 2026,
        month: 9,
        offset: 0.5,
      }),
    ]) {
      expect(await tools.execute('c1', request)).toMatchObject({
        error: 'invalid_arguments',
      });
    }
    expect(queries.searchReceipts).not.toHaveBeenCalled();
    expect(queries.receiptDetail).not.toHaveBeenCalled();
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
      byCategory: [
        {
          category: 'lacteos_huevos',
          label: 'Lácteos y huevos',
          amount: 5000,
          itemCount: 3,
        },
      ],
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
      label: 'Lácteos y huevos',
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

describe('ReceiptQueryTools.list_category_items', () => {
  it('lista los ítems de una categoría con producto, monto, fecha y comercio', async () => {
    const { tools, queries } = build();
    const result = await tools.execute(
      'c1',
      call('list_category_items', {
        category: 'lacteos_huevos',
        year: 2026,
        month: 9,
        limit: null,
      }),
    );

    expect(queries.listCategoryItems).toHaveBeenCalledWith(
      'c1',
      'lacteos_huevos',
      2026,
      9,
      20,
    );
    expect(result).toEqual({
      category: 'lacteos_huevos',
      label: 'Lácteos y huevos',
      items: [
        {
          description: 'Leche entera 1L',
          amount: 3200,
          date: '2026-09-03',
          merchant: 'Jumbo',
        },
        {
          description: 'HUEVOS 12U',
          amount: 4230,
          date: '2026-09-07',
          merchant: 'Líder',
        },
      ],
    });
  });

  it('respeta el límite pedido', async () => {
    const { tools, queries } = build();
    await tools.execute(
      'c1',
      call('list_category_items', {
        category: 'lacteos_huevos',
        year: 2026,
        month: 9,
        limit: 5,
      }),
    );
    expect(queries.listCategoryItems).toHaveBeenCalledWith(
      'c1',
      'lacteos_huevos',
      2026,
      9,
      5,
    );
  });

  it('rechaza una categoría fuera de la taxonomía', async () => {
    const { tools, queries } = build();
    const result = await tools.execute(
      'c1',
      call('list_category_items', {
        category: 'inventada',
        year: 2026,
        month: 9,
        limit: null,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ error: 'invalid_arguments' }),
    );
    expect(queries.listCategoryItems).not.toHaveBeenCalled();
  });
});
