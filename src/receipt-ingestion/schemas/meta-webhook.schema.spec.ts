import {
  extractIncomingMessages,
  metaWebhookSchema,
} from './meta-webhook.schema.js';

const buildPayload = (messages: unknown[]) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'entry-1',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '56900000000',
              phone_number_id: '111',
            },
            messages,
          },
        },
      ],
    },
  ],
});

describe('metaWebhookSchema', () => {
  it('extrae mensajes de imagen y texto normalizados', () => {
    const payload = metaWebhookSchema.parse(
      buildPayload([
        {
          id: 'wamid.img',
          from: '56912345678',
          timestamp: '1725300000',
          type: 'image',
          image: { id: 'media-1', mime_type: 'image/jpeg', sha256: 'abc' },
        },
        {
          id: 'wamid.txt',
          from: '56912345678',
          timestamp: '1725300005',
          type: 'text',
          text: { body: ' Listo ' },
        },
      ]),
    );

    const messages = extractIncomingMessages(payload);

    expect(messages).toEqual([
      {
        kind: 'image',
        waMessageId: 'wamid.img',
        senderPhoneE164: '+56912345678',
        receivedAt: new Date(1725300000 * 1000),
        mediaId: 'media-1',
        mimeType: 'image/jpeg',
      },
      {
        kind: 'text',
        waMessageId: 'wamid.txt',
        senderPhoneE164: '+56912345678',
        receivedAt: new Date(1725300005 * 1000),
        body: 'Listo',
      },
    ]);
  });

  it('ignora tipos de mensaje no soportados y notificaciones de estado', () => {
    const payload = metaWebhookSchema.parse(
      buildPayload([
        {
          id: 'wamid.aud',
          from: '56912345678',
          timestamp: '1725300000',
          type: 'audio',
          audio: { id: 'a1' },
        },
      ]),
    );

    expect(extractIncomingMessages(payload)).toEqual([]);
  });

  it('acepta un cambio sin mensajes (solo statuses)', () => {
    const payload = metaWebhookSchema.parse({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'entry-1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1', phone_number_id: '1' },
                statuses: [{ id: 'wamid.x', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    });

    expect(extractIncomingMessages(payload)).toEqual([]);
  });

  it('rechaza un objeto que no es de WhatsApp', () => {
    expect(
      metaWebhookSchema.safeParse({ object: 'page', entry: [] }).success,
    ).toBe(false);
  });

  it('rechaza un mensaje type=image sin el objeto image', () => {
    const payload = buildPayload([
      {
        id: 'wamid.img',
        from: '56912345678',
        timestamp: '1725300000',
        type: 'image',
      },
    ]);

    expect(metaWebhookSchema.safeParse(payload).success).toBe(false);
  });

  it('rechaza un mensaje de imagen sin image.id', () => {
    const payload = buildPayload([
      {
        id: 'wamid.img',
        from: '56912345678',
        timestamp: '1725300000',
        type: 'image',
        image: { mime_type: 'image/jpeg' },
      },
    ]);

    expect(metaWebhookSchema.safeParse(payload).success).toBe(false);
  });

  it('rechaza un mensaje con timestamp no numérico', () => {
    const payload = buildPayload([
      {
        id: 'wamid.txt',
        from: '56912345678',
        timestamp: 'abc',
        type: 'text',
        text: { body: 'hola' },
      },
    ]);

    expect(metaWebhookSchema.safeParse(payload).success).toBe(false);
  });
});
