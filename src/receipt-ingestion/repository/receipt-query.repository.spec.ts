import {
  buildComparisonRows,
  mapCategorySummaryRow,
  mapGroupListRow,
} from './receipt-query.repository.js';

describe('mapGroupListRow', () => {
  it('convierte snake_case a camelCase preservando los valores', () => {
    const createdAt = new Date('2026-09-01T12:00:00.000Z');
    const closedAt = new Date('2026-09-01T13:00:00.000Z');
    const result = mapGroupListRow({
      id: 'g1',
      status: 'ready',
      receipt_date: '2026-09-01',
      merchant_raw: 'JUMBO',
      merchant_name: 'Jumbo',
      total_declared: '12345.00',
      review_reasons: [],
      page_count: 2,
      item_count: 7,
      created_at: createdAt,
      closed_at: closedAt,
    });
    expect(result).toEqual({
      id: 'g1',
      status: 'ready',
      receiptDate: '2026-09-01',
      merchantRaw: 'JUMBO',
      merchantName: 'Jumbo',
      totalDeclared: '12345.00',
      reviewReasons: [],
      pageCount: 2,
      itemCount: 7,
      createdAt,
      closedAt,
    });
  });

  it('preserva nulos para campos opcionales', () => {
    const result = mapGroupListRow({
      id: 'g2',
      status: 'needs_review',
      receipt_date: null,
      merchant_raw: null,
      merchant_name: null,
      total_declared: null,
      review_reasons: ['low_confidence'],
      page_count: 1,
      item_count: 0,
      created_at: new Date('2026-09-02T00:00:00.000Z'),
      closed_at: null,
    });
    expect(result.receiptDate).toBeNull();
    expect(result.merchantName).toBeNull();
    expect(result.closedAt).toBeNull();
    expect(result.reviewReasons).toEqual(['low_confidence']);
  });
});

describe('mapCategorySummaryRow', () => {
  it('convierte item_count a itemCount', () => {
    expect(
      mapCategorySummaryRow({
        category: 'abarrotes',
        amount: '5000.00',
        item_count: 3,
      }),
    ).toEqual({ category: 'abarrotes', amount: '5000.00', itemCount: 3 });
  });
});

describe('buildComparisonRows', () => {
  it('agrupa las categorías por año y mes', () => {
    const totals = [
      { year: 2026, month: 7, total: '10000.00' },
      { year: 2026, month: 8, total: '0' },
      { year: 2026, month: 9, total: '3000.00' },
    ];
    const categories = [
      {
        year: 2026,
        month: 7,
        category: 'abarrotes',
        amount: '6000.00',
        item_count: 4,
      },
      {
        year: 2026,
        month: 7,
        category: 'bebidas',
        amount: '4000.00',
        item_count: 2,
      },
      {
        year: 2026,
        month: 9,
        category: 'lacteos_huevos',
        amount: '3000.00',
        item_count: 1,
      },
    ];
    expect(buildComparisonRows(totals, categories)).toEqual([
      {
        year: 2026,
        month: 7,
        total: '10000.00',
        byCategory: [
          { category: 'abarrotes', amount: '6000.00', itemCount: 4 },
          { category: 'bebidas', amount: '4000.00', itemCount: 2 },
        ],
      },
      { year: 2026, month: 8, total: '0', byCategory: [] },
      {
        year: 2026,
        month: 9,
        total: '3000.00',
        byCategory: [
          { category: 'lacteos_huevos', amount: '3000.00', itemCount: 1 },
        ],
      },
    ]);
  });

  it('devuelve un arreglo vacío cuando no hay meses', () => {
    expect(buildComparisonRows([], [])).toEqual([]);
  });
});
