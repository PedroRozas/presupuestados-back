import { Injectable, Logger } from '@nestjs/common';
import {
  QUERY_UNRESOLVED_MESSAGE,
  ReceiptQueryService,
} from '../../query/receipt-query.service.js';
import { maskSenderAddress } from '../../utils/sender-address.js';
import type { AnswerQueryJobPayload } from '../receipt-queue.constants.js';
import { ReceiptQueueService } from '../receipt-queue.service.js';

@Injectable()
export class AnswerQueryProcessor {
  private readonly logger = new Logger(AnswerQueryProcessor.name);

  constructor(
    private readonly queries: ReceiptQueryService,
    private readonly queue: ReceiptQueueService,
  ) {}

  async process(payload: AnswerQueryJobPayload): Promise<void> {
    const answer = await this.answerOrFallback(payload);
    await this.queue.enqueueNotifyUser({
      toAddress: payload.senderAddress,
      body: answer,
    });
    this.logger.log(
      `answer_query_done couple=${payload.coupleId} sender=${maskSenderAddress(payload.senderAddress)}`,
    );
  }

  private async answerOrFallback(
    payload: AnswerQueryJobPayload,
  ): Promise<string> {
    try {
      return await this.queries.answer({
        coupleId: payload.coupleId,
        message: payload.message,
      });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.name : 'unknown';
      this.logger.error(
        `answer_query_failed couple=${payload.coupleId} reason=${reason}`,
      );
      return QUERY_UNRESOLVED_MESSAGE;
    }
  }
}
