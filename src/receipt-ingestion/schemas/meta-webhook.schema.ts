import { z } from 'zod';
import type {
  IncomingMessage,
  IncomingMessageBase,
} from './incoming-message.js';

const MILLISECONDS_PER_SECOND = 1000;

const timestampSchema = z.string().regex(/^\d+$/);

const imageMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: timestampSchema,
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
  timestamp: timestampSchema,
  type: z.literal('text'),
  text: z.object({ body: z.string() }),
});

const otherMessageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    timestamp: timestampSchema,
    type: z.string().refine((type) => type !== 'image' && type !== 'text'),
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
): IncomingMessage | undefined => {
  const base: IncomingMessageBase = {
    channelMessageId: message.id,
    senderAddress: toE164(message.from),
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
): IncomingMessage[] =>
  payload.entry
    .flatMap((entry) => entry.changes)
    .flatMap((change) => change.value.messages ?? [])
    .map(toIncomingMessage)
    .filter((message): message is IncomingMessage => message !== undefined);
