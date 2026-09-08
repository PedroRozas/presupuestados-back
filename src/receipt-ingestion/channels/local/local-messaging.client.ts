import { Injectable, Logger } from '@nestjs/common';
import { maskSenderAddress } from '../../utils/sender-address.js';
import type { MessagingClient } from '../messaging.client.js';

@Injectable()
export class LocalMessagingClient implements MessagingClient {
  private readonly logger = new Logger(LocalMessagingClient.name);

  sendText(toAddress: string, body: string): Promise<void> {
    this.logger.log(
      `text_local to=${maskSenderAddress(toAddress)} body="${body}"`,
    );
    return Promise.resolve();
  }
}
