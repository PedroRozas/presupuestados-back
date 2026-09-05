import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractionService,
  type ExtractionOutcome,
} from '../../extraction/extraction.service.js';
import { RECEIPT_REVIEW_REASONS } from '../../receipt.constants.js';
import { ReceiptGroupsRepository } from '../../repository/receipt-groups.repository.js';
import {
  buildExtractionFailedMessage,
  buildExtractionReadyMessage,
  buildExtractionReviewMessage,
  buildMonthlyCapMessage,
} from '../../whatsapp/receipt-notifications.js';
import { ReceiptQueueService } from '../receipt-queue.service.js';
import type { ExtractGroupJobPayload } from '../receipt-queue.constants.js';

@Injectable()
export class ExtractGroupProcessor {
  private readonly logger = new Logger(ExtractGroupProcessor.name);

  constructor(
    private readonly extraction: ExtractionService,
    private readonly queue: ReceiptQueueService,
    private readonly groups: ReceiptGroupsRepository,
  ) {}

  async process(
    payload: ExtractGroupJobPayload,
    attempt: number,
  ): Promise<ExtractionOutcome> {
    const outcome = await this.extraction.extractGroup({
      groupId: payload.groupId,
      coupleId: payload.coupleId,
      attempt,
    });
    const body = this.messageFor(outcome);
    if (body) {
      await this.queue.enqueueNotifyUser({
        toPhoneE164: payload.senderPhoneE164,
        body,
      });
    }
    return outcome;
  }

  async onExhausted(payload: ExtractGroupJobPayload): Promise<void> {
    await this.groups.markFailed(payload.groupId, [
      RECEIPT_REVIEW_REASONS.EXTRACTION_FAILED,
    ]);
    await this.queue.enqueueNotifyUser({
      toPhoneE164: payload.senderPhoneE164,
      body: buildExtractionFailedMessage(),
    });
    this.logger.error(`extraction_exhausted group=${payload.groupId}`);
  }

  private messageFor(outcome: ExtractionOutcome): string | undefined {
    if (outcome.outcome === 'monthly_cap') return buildMonthlyCapMessage();
    if (outcome.outcome !== 'extracted') return undefined;
    return outcome.status === 'ready'
      ? buildExtractionReadyMessage(outcome.summary)
      : buildExtractionReviewMessage(outcome.summary, outcome.reasons);
  }
}
