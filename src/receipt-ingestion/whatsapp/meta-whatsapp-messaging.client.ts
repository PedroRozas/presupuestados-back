import { Injectable, Logger } from '@nestjs/common';
import { ReceiptConfigService } from '../receipt.config.js';
import { maskPhone } from '../utils/mask-phone.js';
import { buildTextMessageBody } from './whatsapp-message-body.js';
import type { WhatsAppMessagingClient } from './whatsapp-messaging.client.js';

const GRAPH_BASE_URL = 'https://graph.facebook.com';

export class WhatsAppSendError extends Error {
  constructor(status: number) {
    super(`whatsapp_send_failed status=${status}`);
    this.name = 'WhatsAppSendError';
  }
}

@Injectable()
export class MetaWhatsAppMessagingClient implements WhatsAppMessagingClient {
  private readonly logger = new Logger(MetaWhatsAppMessagingClient.name);

  constructor(private readonly config: ReceiptConfigService) {}

  async sendText(toPhoneE164: string, body: string): Promise<void> {
    const url = `${GRAPH_BASE_URL}/${this.config.graphApiVersion}/${this.config.whatsappPhoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTextMessageBody(toPhoneE164, body)),
    });

    if (!response.ok) {
      throw new WhatsAppSendError(response.status);
    }
    this.logger.log(`whatsapp_text_sent to=${maskPhone(toPhoneE164)}`);
  }
}
