import { evaluateReview } from './review-rules.js';
import { salcobrandReceipt } from './fixtures/salcobrand.js';
import type { ExtractionOutput } from './extraction-output.schema.js';

const thresholds = { minConfidence: 0.85, totalToleranceClp: 50 };

const output = (overrides: Partial<ExtractionOutput>): ExtractionOutput => ({
  merchant_raw: 'JUMBO',
  merchant_rut: null,
  receipt_date: '2026-09-01',
  total: 3480,
  currency: 'CLP',
  source_kind: 'printed',
  items: [
    {
      description_raw: 'A',
      product_name: null,
      qty: null,
      unit_price: null,
      amount: 1290,
      category: 'otros',
      confidence: 0.9,
    },
    {
      description_raw: 'B',
      product_name: null,
      qty: null,
      unit_price: null,
      amount: 2190,
      category: 'otros',
      confidence: 0.9,
    },
  ],
  confidence: 0.93,
  warnings: [],
  ...overrides,
});

describe('evaluateReview', () => {
  it('mantiene pendiente Salcobrand si se omiten descuentos o se duplica el total ahorrado', () => {
    const missingDiscounts = salcobrandReceipt.items.filter(
      (item) => item.amount > 0,
    );
    const doubleDiscounts = [
      ...salcobrandReceipt.items,
      { ...salcobrandReceipt.items[1], amount: -4236 },
    ];
    for (const items of [missingDiscounts, doubleDiscounts]) {
      expect(
        evaluateReview({ ...salcobrandReceipt, items }, thresholds),
      ).toEqual({ status: 'needs_review', reasons: ['total_mismatch'] });
    }
  });
  it('marca ready cuando todo cuadra', () => {
    expect(evaluateReview(output({}), thresholds)).toEqual({
      status: 'ready',
      reasons: [],
    });
  });

  it('acepta una diferencia dentro de la tolerancia', () => {
    expect(evaluateReview(output({ total: 3500 }), thresholds).status).toBe(
      'ready',
    );
  });

  it('marca total_mismatch fuera de la tolerancia', () => {
    expect(evaluateReview(output({ total: 4000 }), thresholds)).toEqual({
      status: 'needs_review',
      reasons: ['total_mismatch'],
    });
  });

  it('marca total_mismatch si el total es nulo', () => {
    expect(
      evaluateReview(output({ total: null }), thresholds).reasons,
    ).toContain('total_mismatch');
  });

  it('marca low_confidence bajo el umbral', () => {
    expect(
      evaluateReview(output({ confidence: 0.8 }), thresholds).reasons,
    ).toEqual(['low_confidence']);
  });

  it('marca handwritten siempre, aunque la confianza sea alta', () => {
    expect(
      evaluateReview(
        output({ source_kind: 'handwritten', confidence: 0.99 }),
        thresholds,
      ).reasons,
    ).toEqual(['handwritten']);
  });

  it('marca missing_date si no hay fecha', () => {
    expect(
      evaluateReview(output({ receipt_date: null }), thresholds).reasons,
    ).toEqual(['missing_date']);
  });

  it('acumula varios motivos en orden fijo', () => {
    expect(
      evaluateReview(
        output({
          total: null,
          confidence: 0.1,
          source_kind: 'handwritten',
          receipt_date: null,
        }),
        thresholds,
      ).reasons,
    ).toEqual([
      'total_mismatch',
      'low_confidence',
      'handwritten',
      'missing_date',
    ]);
  });
});
