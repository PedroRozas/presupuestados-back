import { Injectable, Logger } from '@nestjs/common';
import { ReceiptConfigService } from '../../receipt.config.js';
import { TELEGRAM_TEXT_MAX_CHARS } from '../../receipt.constants.js';
import { parseSenderAddress } from '../../utils/sender-address.js';
import type { MessagingClient } from '../messaging.client.js';
import { TelegramApiError, type FetchLike } from './telegram-media.client.js';

@Injectable()
export class TelegramMessagingClient implements MessagingClient {
  private readonly logger = new Logger(TelegramMessagingClient.name);

  constructor(
    private readonly config: ReceiptConfigService,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async sendText(toAddress: string, body: string): Promise<void> {
    const chatId = Number(parseSenderAddress(toAddress).id);
    const text = this.truncate(body);
    const url = `${this.config.telegramApiBaseUrl}/bot${this.config.telegramBotToken}/sendMessage`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!response.ok) {
      throw new TelegramApiError('sendMessage', response.status);
    }
    this.logger.log(`telegram_text_sent to=${toAddress}`);
  }

  private truncate(body: string): string {
    if (body.length <= TELEGRAM_TEXT_MAX_CHARS) return body;
    this.logger.warn(`telegram_text_truncated length=${body.length}`);
    return body.slice(0, TELEGRAM_TEXT_MAX_CHARS);
  }
}
