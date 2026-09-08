export const WHATSAPP_MESSAGING_CLIENT = Symbol('WHATSAPP_MESSAGING_CLIENT');

export interface WhatsAppMessagingClient {
  sendText(toAddress: string, body: string): Promise<void>;
}
