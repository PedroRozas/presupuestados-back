import { z } from 'zod';

const MILLISECONDS_PER_SECOND = 1000;

const imageMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.literal('image'),
  image: z.object({
    id: z.string(),
    mime_type: z.string().optional(),
    sha256: z.string().optional(),
  }),
});

const textMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.literal('text'),
  text: z.object({ body: z.string() }),
});

const otherMessageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    timestamp: z.string(),
    type: z.string(),
  })
  .passthrough();

const messageSchema = z.union([
  imageMessageSchema,
  textMessageSchema,
  otherMessageSchema,
]);

const changeValueSchema = z
  .object({
    messaging_product: z.literal('whatsapp'),
    metadata: z.object({
      display_phone_number: z.string(),
      phone_number_id: z.string(),
    }),
    messages: z.array(messageSchema).optional(),
  })
  .passthrough();

export const metaWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: changeValueSchema,
        }),
      ),
    }),
  ),
});

export type MetaWebhookPayload = z.infer<typeof metaWebhookSchema>;
type MetaMessage = z.infer<typeof messageSchema>;

interface IncomingMessageBase {
  waMessageId: string;
  senderPhoneE164: string;
  receivedAt: Date;
}

export interface IncomingImageMessage extends IncomingMessageBase {
  kind: 'image';
  mediaId: string;
  mimeType: string | undefined;
}

export interface IncomingTextMessage extends IncomingMessageBase {
  kind: 'text';
  body: string;
}

export type IncomingWhatsAppMessage =
  | IncomingImageMessage
  | IncomingTextMessage;

const toE164 = (from: string): string =>
  from.startsWith('+') ? from : `+${from}`;

const toDate = (timestamp: string): Date =>
  new Date(Number(timestamp) * MILLISECONDS_PER_SECOND);

const isImageMessage = (
  message: MetaMessage,
): message is z.infer<typeof imageMessageSchema> => message.type === 'image';

const isTextMessage = (
  message: MetaMessage,
): message is z.infer<typeof textMessageSchema> => message.type === 'text';

const toIncomingMessage = (
  message: MetaMessage,
): IncomingWhatsAppMessage | undefined => {
  const base: IncomingMessageBase = {
    waMessageId: message.id,
    senderPhoneE164: toE164(message.from),
    receivedAt: toDate(message.timestamp),
  };

  if (isImageMessage(message)) {
    return {
      ...base,
      kind: 'image',
      mediaId: message.image.id,
      mimeType: message.image.mime_type,
    };
  }

  if (isTextMessage(message)) {
    return { ...base, kind: 'text', body: message.text.body.trim() };
  }

  return undefined;
};

export const extractIncomingMessages = (
  payload: MetaWebhookPayload,
): IncomingWhatsAppMessage[] =>
  payload.entry
    .flatMap((entry) => entry.changes)
    .flatMap((change) => change.value.messages ?? [])
    .map(toIncomingMessage)
    .filter(
      (message): message is IncomingWhatsAppMessage => message !== undefined,
    );
