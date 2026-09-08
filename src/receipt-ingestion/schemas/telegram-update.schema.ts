import { z } from 'zod';
import { telegramAddress } from '../utils/sender-address.js';
import type {
  IncomingMessage,
  IncomingMessageBase,
} from './incoming-message.js';

const MILLISECONDS_PER_SECOND = 1000;
const PRIVATE_CHAT_TYPE = 'private';
const IMAGE_MIME_PREFIX = 'image/';
const TELEGRAM_PHOTO_MIME_TYPE = 'image/jpeg';

const photoSizeSchema = z.object({
  file_id: z.string(),
  width: z.number(),
  height: z.number(),
  file_size: z.number().optional(),
});

const documentSchema = z.object({
  file_id: z.string(),
  mime_type: z.string().optional(),
});

const telegramMessageSchema = z.object({
  message_id: z.number().int(),
  date: z.number().int(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  from: z.object({ id: z.number().int(), is_bot: z.boolean() }).optional(),
  text: z.string().optional(),
  photo: z.array(photoSizeSchema).optional(),
  document: documentSchema.optional(),
});

export const telegramUpdateSchema = z
  .object({
    update_id: z.number(),
    message: telegramMessageSchema.optional(),
  })
  .loose();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
type TelegramMessage = z.infer<typeof telegramMessageSchema>;
type PhotoSize = z.infer<typeof photoSizeSchema>;
type HumanTelegramMessage = TelegramMessage & {
  from: NonNullable<TelegramMessage['from']>;
};

const largestPhoto = (photos: PhotoSize[]): PhotoSize | undefined =>
  photos.reduce<PhotoSize | undefined>((best, photo) => {
    if (!best) return photo;
    return (photo.file_size ?? 0) >= (best.file_size ?? 0) ? photo : best;
  }, undefined);

const isFromAllowedHuman = (
  message: TelegramMessage,
): message is HumanTelegramMessage =>
  message.chat.type === PRIVATE_CHAT_TYPE &&
  message.from !== undefined &&
  !message.from.is_bot;

const toIncomingMessage = (
  message: TelegramMessage,
): IncomingMessage | undefined => {
  if (!isFromAllowedHuman(message)) return undefined;
  const base: IncomingMessageBase = {
    channelMessageId: `${message.chat.id}:${message.message_id}`,
    senderAddress: telegramAddress(message.from.id),
    receivedAt: new Date(message.date * MILLISECONDS_PER_SECOND),
  };

  const photo = message.photo ? largestPhoto(message.photo) : undefined;
  if (photo) {
    return {
      ...base,
      kind: 'image',
      mediaId: photo.file_id,
      mimeType: TELEGRAM_PHOTO_MIME_TYPE,
    };
  }

  if (message.document?.mime_type?.startsWith(IMAGE_MIME_PREFIX)) {
    return {
      ...base,
      kind: 'image',
      mediaId: message.document.file_id,
      mimeType: message.document.mime_type,
    };
  }

  const body = message.text?.trim();
  if (body) {
    return { ...base, kind: 'text', body };
  }

  return undefined;
};

export const extractTelegramMessages = (
  update: TelegramUpdate,
): IncomingMessage[] => {
  if (!update.message) return [];
  const message = toIncomingMessage(update.message);
  return message ? [message] : [];
};
