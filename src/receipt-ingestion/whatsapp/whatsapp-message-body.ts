export interface WhatsAppTextMessageBody {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: { preview_url: false; body: string };
}

const stripPlus = (senderAddress: string): string =>
  senderAddress.replace(/^\+/, '');

export const buildTextMessageBody = (
  toAddress: string,
  body: string,
): WhatsAppTextMessageBody => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to: stripPlus(toAddress),
  type: 'text',
  text: { preview_url: false, body },
});
