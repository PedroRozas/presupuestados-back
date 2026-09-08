import {
  extractTelegramMessages,
  telegramUpdateSchema,
  type TelegramUpdate,
} from './telegram-update.schema.js';

const baseMessage = {
  message_id: 42,
  date: 1_757_000_000,
  chat: { id: 123456789, type: 'private' },
  from: { id: 123456789, is_bot: false },
};

const update = (message: Record<string, unknown>): TelegramUpdate =>
  telegramUpdateSchema.parse({ update_id: 1, message });

describe('extractTelegramMessages', () => {
  it('elige la foto de mayor tamaño y la convierte en mensaje de imagen', () => {
    const result = extractTelegramMessages(
      update({
        ...baseMessage,
        photo: [
          { file_id: 'small', width: 90, height: 160, file_size: 1000 },
          { file_id: 'large', width: 720, height: 1280, file_size: 90000 },
          { file_id: 'medium', width: 320, height: 570, file_size: 20000 },
        ],
      }),
    );
    expect(result).toEqual([
      {
        kind: 'image',
        channelMessageId: '123456789:42',
        senderAddress: 'tg:123456789',
        receivedAt: new Date(1_757_000_000_000),
        mediaId: 'large',
        mimeType: 'image/jpeg',
      },
    ]);
  });

  it('usa el último tamaño cuando no hay file_size', () => {
    const [message] = extractTelegramMessages(
      update({
        ...baseMessage,
        photo: [
          { file_id: 'a', width: 90, height: 160 },
          { file_id: 'b', width: 720, height: 1280 },
        ],
      }),
    );
    expect(message).toMatchObject({ kind: 'image', mediaId: 'b' });
  });

  it('acepta un documento con mime de imagen', () => {
    const [message] = extractTelegramMessages(
      update({
        ...baseMessage,
        document: { file_id: 'doc1', mime_type: 'image/png' },
      }),
    );
    expect(message).toMatchObject({
      kind: 'image',
      mediaId: 'doc1',
      mimeType: 'image/png',
    });
  });

  it('ignora documentos que no son imágenes', () => {
    expect(
      extractTelegramMessages(
        update({
          ...baseMessage,
          document: { file_id: 'pdf', mime_type: 'application/pdf' },
        }),
      ),
    ).toEqual([]);
  });

  it('convierte texto recortado', () => {
    expect(
      extractTelegramMessages(update({ ...baseMessage, text: '  listo  ' })),
    ).toEqual([
      {
        kind: 'text',
        channelMessageId: '123456789:42',
        senderAddress: 'tg:123456789',
        receivedAt: new Date(1_757_000_000_000),
        body: 'listo',
      },
    ]);
  });

  it('ignora mensajes de grupos', () => {
    expect(
      extractTelegramMessages(
        update({
          ...baseMessage,
          chat: { id: -1001, type: 'supergroup' },
          text: 'hola',
        }),
      ),
    ).toEqual([]);
  });

  it('ignora mensajes de bots y sin remitente', () => {
    expect(
      extractTelegramMessages(
        update({
          ...baseMessage,
          from: { id: 5, is_bot: true },
          text: 'hola',
        }),
      ),
    ).toEqual([]);
    expect(
      extractTelegramMessages(
        update({ ...baseMessage, from: undefined, text: 'hola' }),
      ),
    ).toEqual([]);
  });

  it('devuelve vacío para updates sin message, como edited_message', () => {
    const parsed = telegramUpdateSchema.parse({
      update_id: 2,
      edited_message: { ...baseMessage, text: 'editado' },
    });
    expect(extractTelegramMessages(parsed)).toEqual([]);
  });

  it('tolera campos desconocidos en el update', () => {
    expect(() =>
      telegramUpdateSchema.parse({
        update_id: 3,
        my_chat_member: { status: 'member' },
      }),
    ).not.toThrow();
  });
});
