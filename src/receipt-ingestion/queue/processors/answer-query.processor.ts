import { Injectable, Logger } from '@nestjs/common';
import { ReceiptQueryService } from '../../query/receipt-query.service.js';
import { maskPhone } from '../../utils/mask-phone.js';
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
    const answer = await this.queries.answer({
      coupleId: payload.coupleId,
      message: payload.message,
    });
    await this.queue.enqueueNotifyUser({
      toPhoneE164: payload.senderPhoneE164,
      body: answer,
    });
    this.logger.log(
      `answer_query_done couple=${payload.coupleId} phone=${maskPhone(payload.senderPhoneE164)}`,
    );
  }
}
