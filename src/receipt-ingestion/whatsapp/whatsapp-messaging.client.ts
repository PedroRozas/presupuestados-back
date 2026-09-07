export const WHATSAPP_MESSAGING_CLIENT = Symbol('WHATSAPP_MESSAGING_CLIENT');

export interface WhatsAppMessagingClient {
  sendText(toPhoneE164: string, body: string): Promise<void>;
}
