import { parseSenderAddress } from '../utils/sender-address.js';
import type { MessagingClient } from './messaging.client.js';

export class MessagingRouter implements MessagingClient {
  constructor(
    private readonly whatsapp: MessagingClient,
    private readonly telegram: MessagingClient,
  ) {}

  sendText(toAddress: string, body: string): Promise<void> {
    const { channel } = parseSenderAddress(toAddress);
    const client = channel === 'telegram' ? this.telegram : this.whatsapp;
    return client.sendText(toAddress, body);
  }
}
