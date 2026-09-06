import {
  RECEIPT_CURRENCY_DEFAULT,
  RECEIPT_REVIEW_REASONS,
  type ReceiptSourceKind,
} from '../receipt.constants.js';
import type { ExtractionOutput } from '../extraction/extraction-output.schema.js';
import {
  evaluateReview,
  type ReviewThresholds,
  type ReviewVerdict,
} from '../extraction/review-rules.js';

export interface ReviewRecalcInput {
  total: number | null;
  itemAmounts: number[];
  confidence: number | null;
  sourceKind: ReceiptSourceKind;
  receiptDate: string | null;
}

const FULL_CONFIDENCE = 1;
const PLACEHOLDER_DESCRIPTION = 'item';
const PLACEHOLDER_CATEGORY = 'otros';

const toExtractionOutput = (input: ReviewRecalcInput): ExtractionOutput => ({
  merchant_raw: null,
  merchant_rut: null,
  receipt_date: input.receiptDate,
  total: input.total,
  currency: RECEIPT_CURRENCY_DEFAULT,
  source_kind: input.sourceKind,
  confidence: input.confidence ?? FULL_CONFIDENCE,
  warnings: [],
  items: input.itemAmounts.map((amount) => ({
    description_raw: PLACEHOLDER_DESCRIPTION,
    qty: null,
    unit_price: null,
    amount,
    category: PLACEHOLDER_CATEGORY,
    confidence: FULL_CONFIDENCE,
  })),
});

export const recalculateReview = (
  input: ReviewRecalcInput,
  thresholds: ReviewThresholds,
): ReviewVerdict => {
  const verdict = evaluateReview(toExtractionOutput(input), thresholds);
  const reasons = verdict.reasons.filter(
    (reason) => reason !== RECEIPT_REVIEW_REASONS.HANDWRITTEN,
  );
  return { status: reasons.length === 0 ? 'ready' : 'needs_review', reasons };
};
