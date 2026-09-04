import type { ReceiptGroupStatus } from '../receipt.constants.js';

const MILLISECONDS_PER_SECOND = 1000;

export type CloseTrigger =
  | { kind: 'window'; pageIndex: number }
  | { kind: 'command' };

export interface CloseDecisionInput {
  status: ReceiptGroupStatus;
  lastImageAt: Date | null;
  lastPageIndex: number;
  trigger: CloseTrigger;
  now: Date;
  windowSeconds: number;
}

export type CloseDecision =
  | { action: 'skip'; reason: 'not_collecting' | 'superseded' }
  | { action: 'reschedule'; delayMs: number }
  | { action: 'close' };

export const decideCloseAction = (input: CloseDecisionInput): CloseDecision => {
  if (input.status !== 'collecting') {
    return { action: 'skip', reason: 'not_collecting' };
  }
  if (input.trigger.kind === 'command' || !input.lastImageAt) {
    return { action: 'close' };
  }
  if (input.lastPageIndex > input.trigger.pageIndex) {
    return { action: 'skip', reason: 'superseded' };
  }
  const windowMs = input.windowSeconds * MILLISECONDS_PER_SECOND;
  const remainingMs =
    input.lastImageAt.getTime() + windowMs - input.now.getTime();
  if (remainingMs > 0) {
    return { action: 'reschedule', delayMs: remainingMs };
  }
  return { action: 'close' };
};
