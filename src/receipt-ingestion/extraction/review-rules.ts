import {
  RECEIPT_REVIEW_REASONS,
  type ReceiptReviewReason,
} from '../receipt.constants.js';
import type {
  ExtractionItem,
  ExtractionOutput,
} from './extraction-output.schema.js';

export interface ReviewThresholds {
  minConfidence: number;
  totalToleranceClp: number;
}

export interface ReviewVerdict {
  status: 'ready' | 'needs_review';
  reasons: ReceiptReviewReason[];
}

export const sumItems = (items: ExtractionItem[]): number =>
  items.reduce((sum, item) => sum + item.amount, 0);

const totalMismatches = (
  output: ExtractionOutput,
  toleranceClp: number,
): boolean =>
  output.total === null ||
  Math.abs(sumItems(output.items) - output.total) > toleranceClp;

export const evaluateReview = (
  output: ExtractionOutput,
  thresholds: ReviewThresholds,
): ReviewVerdict => {
  const reasons: ReceiptReviewReason[] = [];
  if (totalMismatches(output, thresholds.totalToleranceClp)) {
    reasons.push(RECEIPT_REVIEW_REASONS.TOTAL_MISMATCH);
  }
  if (output.confidence < thresholds.minConfidence) {
    reasons.push(RECEIPT_REVIEW_REASONS.LOW_CONFIDENCE);
  }
  if (output.source_kind === 'handwritten') {
    reasons.push(RECEIPT_REVIEW_REASONS.HANDWRITTEN);
  }
  if (output.receipt_date === null) {
    reasons.push(RECEIPT_REVIEW_REASONS.MISSING_DATE);
  }
  return { status: reasons.length === 0 ? 'ready' : 'needs_review', reasons };
};
