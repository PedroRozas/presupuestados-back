import { Injectable, Logger } from '@nestjs/common';
import { maskPhone } from '../utils/mask-phone.js';
import type { WhatsAppMessagingClient } from './whatsapp-messaging.client.js';

@Injectable()
export class LocalWhatsAppMessagingClient implements WhatsAppMessagingClient {
  private readonly logger = new Logger(LocalWhatsAppMessagingClient.name);

  sendText(toPhoneE164: string, body: string): Promise<void> {
    this.logger.log(
      `whatsapp_text_local to=${maskPhone(toPhoneE164)} body="${body}"`,
    );
    return Promise.resolve();
  }
}
