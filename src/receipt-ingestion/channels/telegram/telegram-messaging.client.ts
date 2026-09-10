import { Injectable, Logger } from '@nestjs/common';
import { ReceiptConfigService } from '../../receipt.config.js';
import { TELEGRAM_TEXT_MAX_CHARS } from '../../receipt.constants.js';
import {
  maskSenderAddress,
  parseSenderAddress,
} from '../../utils/sender-address.js';
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
    const url = `${this.config.telegramApiBaseUrl}/bot${this.config.telegramBotToken}/sendMessage`;
    for (const text of this.splitText(body)) {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!response.ok) {
        throw new TelegramApiError('sendMessage', response.status);
      }
    }
    this.logger.log(`telegram_text_sent to=${maskSenderAddress(toAddress)}`);
  }

  private splitText(body: string): string[] {
    if (body.length <= TELEGRAM_TEXT_MAX_CHARS) return [body];
    const chunks: string[] = [];
    let remaining = body;
    while (remaining.length > TELEGRAM_TEXT_MAX_CHARS) {
      const lineEnd = remaining.lastIndexOf('\n', TELEGRAM_TEXT_MAX_CHARS - 1);
      let end = lineEnd > 0 ? lineEnd + 1 : TELEGRAM_TEXT_MAX_CHARS;
      // Do not separate the UTF-16 halves of an emoji on a hard line break.
      if ((remaining.codePointAt(end - 1) ?? 0) > 0xffff) end -= 1;
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    if (remaining.length > 0) chunks.push(remaining);
    return chunks;
  }
}
