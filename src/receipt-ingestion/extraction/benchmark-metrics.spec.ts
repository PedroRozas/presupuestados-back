import { aggregateScores, scoreExtraction } from './benchmark-metrics.js';
import type { ExtractionOutput } from './extraction-output.schema.js';

const output = (overrides: Partial<ExtractionOutput>): ExtractionOutput => ({
  merchant_raw: null,
  merchant_rut: null,
  receipt_date: '2026-09-01',
  total: 3480,
  currency: 'CLP',
  source_kind: 'printed',
  confidence: 0.9,
  warnings: [],
  items: [1290, 2190].map((amount) => ({
    description_raw: 'x',
    qty: null,
    unit_price: null,
    amount,
    category: 'otros',
    confidence: 0.9,
  })),
  ...overrides,
});
const expected = {
  id: 'r1',
  images: ['r1.jpg'],
  receipt_date: '2026-09-01',
  total: 3480,
  item_amounts: [1290, 2190, 990],
};

describe('scoreExtraction', () => {
  it('puntúa total, fecha y recall de montos', () => {
    expect(scoreExtraction(expected, output({}))).toEqual({
      totalMatch: true,
      dateMatch: true,
      itemAmountRecall: 2 / 3,
    });
  });

  it('empareja montos repetidos como multiset', () => {
    expect(
      scoreExtraction({ ...expected, item_amounts: [1290, 1290] }, output({}))
        .itemAmountRecall,
    ).toBe(0.5);
  });

  it('cuenta como acierto una fecha nula esperada y devuelta', () => {
    expect(
      scoreExtraction(
        { ...expected, receipt_date: null },
        output({ receipt_date: null }),
      ).dateMatch,
    ).toBe(true);
  });
});

describe('aggregateScores', () => {
  it('promedia porcentajes, tokens y latencia', () => {
    expect(
      aggregateScores([
        {
          totalMatch: true,
          dateMatch: false,
          itemAmountRecall: 1,
          tokensIn: 100,
          tokensOut: 10,
          latencyMs: 1000,
          failed: false,
        },
        {
          totalMatch: false,
          dateMatch: true,
          itemAmountRecall: 0.5,
          tokensIn: 300,
          tokensOut: 30,
          latencyMs: 3000,
          failed: false,
        },
      ]),
    ).toEqual({
      receipts: 2,
      totalAccuracy: 0.5,
      dateAccuracy: 0.5,
      itemAmountRecall: 0.75,
      avgTokensIn: 200,
      avgTokensOut: 20,
      avgLatencyMs: 2000,
      failures: 0,
    });
  });

  it('cuenta las corridas marcadas como fallidas', () => {
    expect(
      aggregateScores([
        {
          totalMatch: false,
          dateMatch: false,
          itemAmountRecall: 0,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: 0,
          failed: true,
        },
        {
          totalMatch: true,
          dateMatch: true,
          itemAmountRecall: 1,
          tokensIn: 100,
          tokensOut: 10,
          latencyMs: 1000,
          failed: false,
        },
      ]).failures,
    ).toBe(1);
  });
});
