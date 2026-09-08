import { Inject, Injectable } from '@nestjs/common';
import {
  WHATSAPP_MESSAGING_CLIENT,
  type WhatsAppMessagingClient,
} from '../../whatsapp/whatsapp-messaging.client.js';
import type { NotifyUserJobPayload } from '../receipt-queue.constants.js';

@Injectable()
export class NotifyUserProcessor {
  constructor(
    @Inject(WHATSAPP_MESSAGING_CLIENT)
    private readonly messaging: WhatsAppMessagingClient,
  ) {}

  async process(payload: NotifyUserJobPayload): Promise<void> {
    await this.messaging.sendText(payload.toAddress, payload.body);
  }
}
