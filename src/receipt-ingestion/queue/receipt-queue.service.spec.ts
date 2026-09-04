import {
  ReceiptQueueService,
  ReceiptQueueUnavailableError,
  buildCloseGroupJobId,
} from './receipt-queue.service.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type { IngestImageJobPayload } from './receipt-queue.constants.js';

const buildConfig = (): ReceiptConfigService =>
  ({
    redisUrl: undefined,
    retryAttempts: 3,
    retryBackoffMs: 5000,
  }) as unknown as ReceiptConfigService;

const buildPayload = (): IngestImageJobPayload => ({
  waMessageId: 'wamid.1',
  mediaId: 'media-1',
  mimeType: 'image/jpeg',
  senderPhoneE164: '+56912345678',
  senderUserId: 'u1',
  coupleId: 'c1',
  receivedAtIso: new Date(0).toISOString(),
});

describe('ReceiptQueueService', () => {
  it('no lanza al construirse sin REDIS_URL configurado', () => {
    expect(() => new ReceiptQueueService(buildConfig())).not.toThrow();
  });

  it('rechaza enqueueIngestImage con ReceiptQueueUnavailableError sin REDIS_URL', async () => {
    const service = new ReceiptQueueService(buildConfig());

    await expect(service.enqueueIngestImage(buildPayload())).rejects.toThrow(
      ReceiptQueueUnavailableError,
    );
  });
});

describe('buildCloseGroupJobId', () => {
  it('usa grupo y página para cierres por ventana', () => {
    expect(
      buildCloseGroupJobId({ kind: 'window', groupId: 'g1', pageIndex: 3 }),
    ).toBe('close-g1-3');
  });

  it('usa pareja y número sin signo más para cierres por comando', () => {
    expect(
      buildCloseGroupJobId({
        kind: 'command',
        senderPhoneE164: '+56912345678',
        coupleId: 'c1',
      }),
    ).toBe('close-c1-56912345678-command');
  });
});
