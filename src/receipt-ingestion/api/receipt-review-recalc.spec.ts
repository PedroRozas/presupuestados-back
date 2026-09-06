import { recalculateReview } from './receipt-review-recalc.js';

const thresholds = { minConfidence: 0.85, totalToleranceClp: 50 };

describe('recalculateReview', () => {
  it('queda ready cuando el total cuadra, hay fecha y confianza suficiente', () => {
    expect(
      recalculateReview(
        {
          total: 3480,
          itemAmounts: [1290, 2190],
          confidence: 0.95,
          sourceKind: 'printed',
          receiptDate: '2026-09-01',
        },
        thresholds,
      ),
    ).toEqual({ status: 'ready', reasons: [] });
  });

  it('marca total_mismatch cuando el total es nulo', () => {
    expect(
      recalculateReview(
        {
          total: null,
          itemAmounts: [1290],
          confidence: 0.95,
          sourceKind: 'printed',
          receiptDate: '2026-09-01',
        },
        thresholds,
      ),
    ).toEqual({ status: 'needs_review', reasons: ['total_mismatch'] });
  });

  it('marca missing_date cuando no hay fecha', () => {
    expect(
      recalculateReview(
        {
          total: 1290,
          itemAmounts: [1290],
          confidence: 0.95,
          sourceKind: 'printed',
          receiptDate: null,
        },
        thresholds,
      ),
    ).toEqual({ status: 'needs_review', reasons: ['missing_date'] });
  });

  it('una boleta manuscrita ya revisada por la persona no vuelve a needs_review', () => {
    expect(
      recalculateReview(
        {
          total: 1290,
          itemAmounts: [1290],
          confidence: 0.95,
          sourceKind: 'handwritten',
          receiptDate: '2026-09-01',
        },
        thresholds,
      ),
    ).toEqual({ status: 'ready', reasons: [] });
  });

  it('trata la confianza nula como total', () => {
    expect(
      recalculateReview(
        {
          total: 1290,
          itemAmounts: [1290],
          confidence: null,
          sourceKind: 'printed',
          receiptDate: '2026-09-01',
        },
        thresholds,
      ),
    ).toEqual({ status: 'ready', reasons: [] });
  });

  it('mantiene low_confidence cuando la extracción fue poco confiable', () => {
    expect(
      recalculateReview(
        {
          total: 1290,
          itemAmounts: [1290],
          confidence: 0.5,
          sourceKind: 'printed',
          receiptDate: '2026-09-01',
        },
        thresholds,
      ).reasons,
    ).toEqual(['low_confidence']);
  });
});
