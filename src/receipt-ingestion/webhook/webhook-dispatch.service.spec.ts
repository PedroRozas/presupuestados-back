import {
  WebhookDispatchService,
  isCloseCommand,
} from './webhook-dispatch.service.js';
import type { AllowedSendersRepository } from '../repository/allowed-senders.repository.js';
import type { ReceiptQueueService } from '../queue/receipt-queue.service.js';
import type { RedisService } from '../../security/redis.service.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type { MetaWebhookPayload } from '../schemas/meta-webhook.schema.js';

const PHONE = '56912345678';

const buildPayload = (messages: unknown[]): MetaWebhookPayload =>
  ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'e',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '1', phone_number_id: '1' },
              messages,
            },
          },
        ],
      },
    ],
  }) as MetaWebhookPayload;

const imageMessage = (id: string) => ({
  id,
  from: PHONE,
  timestamp: '1725300000',
  type: 'image',
  image: { id: `media-${id}`, mime_type: 'image/jpeg' },
});

describe('WebhookDispatchService', () => {
  const buildService = (options: {
    sender?: { userId: string; coupleId: string } | undefined;
    rateLimitCount?: number;
  }) => {
    const allowedSenders = {
      findEnabledByPhone: jest.fn(() =>
        Promise.resolve(
          options.sender
            ? {
                id: 's1',
                phoneE164: `+${PHONE}`,
                enabled: true,
                createdAt: new Date(),
                ...options.sender,
              }
            : undefined,
        ),
      ),
    } as unknown as AllowedSendersRepository;
    const queue = {
      enqueueIngestImage: jest.fn(() => Promise.resolve()),
      enqueueCloseGroup: jest.fn(() => Promise.resolve()),
    };
    const redis = {
      incrementWithTtl: jest.fn(() =>
        Promise.resolve(options.rateLimitCount ?? 1),
      ),
    } as unknown as RedisService;
    const config = {
      rateLimitWindowSeconds: 60,
      rateLimitMax: 20,
    } as ReceiptConfigService;

    return {
      service: new WebhookDispatchService(
        allowedSenders,
        queue as unknown as ReceiptQueueService,
        redis,
        config,
      ),
      queue,
    };
  };

  it('encola las imágenes de un remitente permitido', async () => {
    const { service, queue } = buildService({
      sender: { userId: 'u1', coupleId: 'c1' },
    });

    await service.dispatch(buildPayload([imageMessage('wamid.1')]));

    expect(queue.enqueueIngestImage).toHaveBeenCalledWith({
      waMessageId: 'wamid.1',
      mediaId: 'media-wamid.1',
      mimeType: 'image/jpeg',
      senderPhoneE164: `+${PHONE}`,
      senderUserId: 'u1',
      coupleId: 'c1',
      receivedAtIso: new Date(1725300000 * 1000).toISOString(),
    });
  });

  it('descarta en silencio a un remitente desconocido', async () => {
    const { service, queue } = buildService({ sender: undefined });

    await service.dispatch(buildPayload([imageMessage('wamid.1')]));

    expect(queue.enqueueIngestImage).not.toHaveBeenCalled();
  });

  it('descarta cuando el remitente excede el rate limit', async () => {
    const { service, queue } = buildService({
      sender: { userId: 'u1', coupleId: 'c1' },
      rateLimitCount: 21,
    });

    await service.dispatch(buildPayload([imageMessage('wamid.1')]));

    expect(queue.enqueueIngestImage).not.toHaveBeenCalled();
  });

  it('ignora texto que no es un comando', async () => {
    const { service, queue } = buildService({
      sender: { userId: 'u1', coupleId: 'c1' },
    });

    await service.dispatch(
      buildPayload([
        {
          id: 'wamid.t',
          from: PHONE,
          timestamp: '1',
          type: 'text',
          text: { body: 'hola' },
        },
      ]),
    );

    expect(queue.enqueueIngestImage).not.toHaveBeenCalled();
    expect(queue.enqueueCloseGroup).not.toHaveBeenCalled();
  });

  it('encola el cierre por comando cuando el texto es "listo"', async () => {
    const { service, queue } = buildService({
      sender: { userId: 'u1', coupleId: 'c1' },
    });

    await service.dispatch(
      buildPayload([
        {
          id: 'wamid.t',
          from: PHONE,
          timestamp: '1',
          type: 'text',
          text: { body: '  Listo ' },
        },
      ]),
    );

    expect(queue.enqueueCloseGroup).toHaveBeenCalledWith(
      { kind: 'command', senderPhoneE164: `+${PHONE}`, coupleId: 'c1' },
      0,
    );
    expect(queue.enqueueIngestImage).not.toHaveBeenCalled();
  });

  it('no encola nada para un texto distinto de "listo"', async () => {
    const { service, queue } = buildService({
      sender: { userId: 'u1', coupleId: 'c1' },
    });

    await service.dispatch(
      buildPayload([
        {
          id: 'wamid.t',
          from: PHONE,
          timestamp: '1',
          type: 'text',
          text: { body: 'hola' },
        },
      ]),
    );

    expect(queue.enqueueCloseGroup).not.toHaveBeenCalled();
  });
});

describe('isCloseCommand', () => {
  it('reconoce el comando sin importar mayúsculas ni espacios', () => {
    expect(isCloseCommand(' LISTO ')).toBe(true);
    expect(isCloseCommand('listo!')).toBe(false);
  });
});
