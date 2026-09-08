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
import { maskSenderAddress } from '../utils/sender-address.js';
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
    const sender = await this.allowedSenders.findEnabledByAddress(
      message.senderAddress,
    );
    if (!sender) {
      this.logger.warn(
        `sender_not_allowed sender=${maskSenderAddress(message.senderAddress)}`,
      );
      return;
    }

    if (!(await this.isWithinRateLimit(message.senderAddress))) {
      this.logger.warn(
        `sender_rate_limited sender=${maskSenderAddress(message.senderAddress)}`,
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

  private async isWithinRateLimit(senderAddress: string): Promise<boolean> {
    const key = `${RECEIPT_RATE_LIMIT_KEY_PREFIX}:${senderAddress}`;
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
      channelMessageId: message.channelMessageId,
      mediaId: message.mediaId,
      mimeType: message.mimeType,
      senderAddress: message.senderAddress,
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
      senderAddress: message.senderAddress,
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
        senderAddress: message.senderAddress,
        coupleId: sender.coupleId,
      },
      IMMEDIATE_DELAY_MS,
    );
  }
}
