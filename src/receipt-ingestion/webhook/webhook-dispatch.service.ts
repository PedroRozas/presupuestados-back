import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../security/redis.service.js';
import { ReceiptConfigService } from '../receipt.config.js';
import {
  RECEIPT_CLOSE_COMMAND,
  RECEIPT_RATE_LIMIT_KEY_PREFIX,
} from '../receipt.constants.js';
import { AllowedSendersRepository } from '../repository/allowed-senders.repository.js';
import { ReceiptQueueService } from '../queue/receipt-queue.service.js';
import {
  extractIncomingMessages,
  type IncomingImageMessage,
  type IncomingTextMessage,
  type IncomingWhatsAppMessage,
  type MetaWebhookPayload,
} from '../schemas/meta-webhook.schema.js';
import { maskPhone } from '../utils/mask-phone.js';
import type { ReceiptAllowedSender } from '../../database/schema/index.js';

const IMMEDIATE_DELAY_MS = 0;

export const isCloseCommand = (body: string): boolean =>
  body.trim().toLowerCase() === RECEIPT_CLOSE_COMMAND;

@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    private readonly allowedSenders: AllowedSendersRepository,
    private readonly queue: ReceiptQueueService,
    private readonly redis: RedisService,
    private readonly config: ReceiptConfigService,
  ) {}

  async dispatch(payload: MetaWebhookPayload): Promise<void> {
    const messages = extractIncomingMessages(payload);
    for (const message of messages) {
      await this.dispatchOne(message);
    }
  }

  private async dispatchOne(message: IncomingWhatsAppMessage): Promise<void> {
    const sender = await this.allowedSenders.findEnabledByPhone(
      message.senderPhoneE164,
    );
    if (!sender) {
      this.logger.debug(
        `sender_not_allowed phone=${maskPhone(message.senderPhoneE164)}`,
      );
      return;
    }

    if (!(await this.isWithinRateLimit(message.senderPhoneE164))) {
      this.logger.warn(
        `sender_rate_limited phone=${maskPhone(message.senderPhoneE164)}`,
      );
      return;
    }

    if (message.kind === 'image') {
      await this.enqueueImage(message, sender);
      return;
    }
    if (isCloseCommand(message.body)) {
      await this.enqueueCloseCommand(message, sender);
      return;
    }
    await this.enqueueQuery(message, sender);
  }

  private async isWithinRateLimit(phoneE164: string): Promise<boolean> {
    const key = `${RECEIPT_RATE_LIMIT_KEY_PREFIX}:${phoneE164}`;
    const count = await this.redis.incrementWithTtl(
      key,
      this.config.rateLimitWindowSeconds,
    );
    return count <= this.config.rateLimitMax;
  }

  private async enqueueImage(
    message: IncomingImageMessage,
    sender: ReceiptAllowedSender,
  ): Promise<void> {
    await this.queue.enqueueIngestImage({
      waMessageId: message.waMessageId,
      mediaId: message.mediaId,
      mimeType: message.mimeType,
      senderPhoneE164: message.senderPhoneE164,
      senderUserId: sender.userId,
      coupleId: sender.coupleId,
      receivedAtIso: message.receivedAt.toISOString(),
    });
  }

  private async enqueueQuery(
    message: IncomingTextMessage,
    sender: ReceiptAllowedSender,
  ): Promise<void> {
    const body = message.body.trim().slice(0, this.config.queryMaxMessageChars);
    if (body.length === 0) return;
    await this.queue.enqueueAnswerQuery({
      senderPhoneE164: message.senderPhoneE164,
      coupleId: sender.coupleId,
      message: body,
    });
  }

  private async enqueueCloseCommand(
    message: IncomingTextMessage,
    sender: ReceiptAllowedSender,
  ): Promise<void> {
    await this.queue.enqueueCloseGroup(
      {
        kind: 'command',
        senderPhoneE164: message.senderPhoneE164,
        coupleId: sender.coupleId,
      },
      IMMEDIATE_DELAY_MS,
    );
  }
}
