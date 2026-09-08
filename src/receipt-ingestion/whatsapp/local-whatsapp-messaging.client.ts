import { Injectable, Logger } from '@nestjs/common';
import { maskSenderAddress } from '../utils/sender-address.js';
import type { WhatsAppMessagingClient } from './whatsapp-messaging.client.js';

@Injectable()
export class LocalWhatsAppMessagingClient implements WhatsAppMessagingClient {
  private readonly logger = new Logger(LocalWhatsAppMessagingClient.name);

  sendText(toAddress: string, body: string): Promise<void> {
    this.logger.log(
      `whatsapp_text_local to=${maskSenderAddress(toAddress)} body="${body}"`,
    );
    return Promise.resolve();
  }
}
