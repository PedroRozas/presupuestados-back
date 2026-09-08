export const MESSAGING_CLIENT = Symbol('MESSAGING_CLIENT');

export interface MessagingClient {
  sendText(toAddress: string, body: string): Promise<void>;
}
