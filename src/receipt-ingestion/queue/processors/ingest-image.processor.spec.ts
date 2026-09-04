import { IngestImageProcessor } from './ingest-image.processor.js';
import type { IngestImageJobPayload } from '../receipt-queue.constants.js';
import type { WhatsAppMediaClient } from '../../whatsapp/whatsapp-media.client.js';
import type { ImageProcessorService } from '../../media/image-processor.service.js';
import type { ReceiptStorageService } from '../../storage/receipt-storage.service.js';
import type { ReceiptGroupService } from '../../groups/receipt-group.service.js';
import type { ReceiptGroupsRepository } from '../../repository/receipt-groups.repository.js';
import type { ReceiptImagesRepository } from '../../repository/receipt-images.repository.js';
import type { ReceiptQueueService } from '../receipt-queue.service.js';
import type { ReceiptConfigService } from '../../receipt.config.js';

const payload: IngestImageJobPayload = {
  waMessageId: 'wamid.1',
  mediaId: 'media-1',
  mimeType: 'image/jpeg',
  senderPhoneE164: '+56912345678',
  senderUserId: 'user-1',
  coupleId: 'couple-1',
  receivedAtIso: '2026-03-05T23:30:00.000Z',
};

const buildProcessor = (overrides: {
  existsByMessageId?: boolean;
  existsBySha256?: boolean;
  nextPageIndex?: number;
}) => {
  const media = {
    download: jest.fn(() =>
      Promise.resolve({ buffer: Buffer.from('jpeg'), mimeType: 'image/jpeg' }),
    ),
  };
  const images = {
    toWebp: jest.fn(() =>
      Promise.resolve({
        buffer: Buffer.from('webp'),
        width: 100,
        height: 200,
        bytes: 4,
        sha256: 'hash-1',
      }),
    ),
  };
  const storage = {
    bucket: 'receipts',
    upload: jest.fn(() => Promise.resolve()),
  };
  const groupService = {
    resolveOpenGroup: jest.fn(() =>
      Promise.resolve({ id: 'group-1', lastImageAt: null }),
    ),
  };
  const groupsRepo = {
    touchLastImageAt: jest.fn(() => Promise.resolve()),
  };
  const imagesRepo = {
    existsByMessageId: jest.fn(() =>
      Promise.resolve(overrides.existsByMessageId ?? false),
    ),
    existsBySha256: jest.fn(() =>
      Promise.resolve(overrides.existsBySha256 ?? false),
    ),
    nextPageIndex: jest.fn(() => Promise.resolve(overrides.nextPageIndex ?? 1)),
    create: jest.fn((values: { storagePath: string }) =>
      Promise.resolve({ id: 'image-1', ...values }),
    ),
  };
  const queue = {
    enqueueCloseGroup: jest.fn(() => Promise.resolve()),
  };
  const config = { groupWindowSeconds: 90 } as ReceiptConfigService;

  const processor = new IngestImageProcessor(
    media as unknown as WhatsAppMediaClient,
    images as unknown as ImageProcessorService,
    storage as unknown as ReceiptStorageService,
    groupService as unknown as ReceiptGroupService,
    groupsRepo as unknown as ReceiptGroupsRepository,
    imagesRepo as unknown as ReceiptImagesRepository,
    queue as unknown as ReceiptQueueService,
    config,
  );

  return {
    processor,
    media,
    images,
    storage,
    groupService,
    groupsRepo,
    imagesRepo,
    queue,
    config,
  };
};

describe('IngestImageProcessor', () => {
  it('descarga, convierte, sube y persiste la imagen en el grupo resuelto', async () => {
    const { processor, storage, imagesRepo, groupsRepo, queue } =
      buildProcessor({
        nextPageIndex: 2,
      });

    const result = await processor.process(payload);

    expect(result).toEqual({
      outcome: 'stored',
      imageId: 'image-1',
      groupId: 'group-1',
    });
    expect(storage.upload).toHaveBeenCalledWith(
      'couple-1/2026/03/group-1/2.webp',
      Buffer.from('webp'),
    );
    expect(imagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        coupleId: 'couple-1',
        waMessageId: 'wamid.1',
        senderUserId: 'user-1',
        storageBucket: 'receipts',
        storagePath: 'couple-1/2026/03/group-1/2.webp',
        sha256: 'hash-1',
        width: 100,
        height: 200,
        bytes: 4,
        pageIndex: 2,
      }),
    );
    expect(groupsRepo.touchLastImageAt).toHaveBeenCalledWith(
      'group-1',
      new Date(payload.receivedAtIso),
    );
    expect(queue.enqueueCloseGroup).toHaveBeenCalledWith(
      { kind: 'window', groupId: 'group-1', pageIndex: 2 },
      90 * 1000,
    );
  });

  it('no descarga nada si el mensaje ya fue procesado', async () => {
    const { processor, media, queue } = buildProcessor({
      existsByMessageId: true,
    });

    const result = await processor.process(payload);

    expect(result).toEqual({ outcome: 'duplicate_message' });
    expect(media.download).not.toHaveBeenCalled();
    expect(queue.enqueueCloseGroup).not.toHaveBeenCalled();
  });

  it('no sube ni persiste si el contenido ya existe para la pareja', async () => {
    const { processor, storage, imagesRepo, queue } = buildProcessor({
      existsBySha256: true,
    });

    const result = await processor.process(payload);

    expect(result).toEqual({ outcome: 'duplicate_content' });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(imagesRepo.create).not.toHaveBeenCalled();
    expect(queue.enqueueCloseGroup).not.toHaveBeenCalled();
  });
});
