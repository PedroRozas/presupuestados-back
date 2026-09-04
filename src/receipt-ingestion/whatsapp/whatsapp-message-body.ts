export interface WhatsAppTextMessageBody {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: { preview_url: false; body: string };
}

const stripPlus = (phoneE164: string): string => phoneE164.replace(/^\+/, '');

export const buildTextMessageBody = (
  toPhoneE164: string,
  body: string,
): WhatsAppTextMessageBody => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: stripPlus(toPhoneE164),
  type: 'text',
  text: { preview_url: false, body },
});
