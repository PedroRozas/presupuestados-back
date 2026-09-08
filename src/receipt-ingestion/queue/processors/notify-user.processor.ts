import { Inject, Injectable } from '@nestjs/common';
import {
  MESSAGING_CLIENT,
  type MessagingClient,
} from '../../channels/messaging.client.js';
import type { NotifyUserJobPayload } from '../receipt-queue.constants.js';

@Injectable()
export class NotifyUserProcessor {
  constructor(
    @Inject(MESSAGING_CLIENT)
    private readonly messaging: MessagingClient,
  ) {}

  async process(payload: NotifyUserJobPayload): Promise<void> {
    await this.messaging.sendText(payload.toAddress, payload.body);
  }
}
