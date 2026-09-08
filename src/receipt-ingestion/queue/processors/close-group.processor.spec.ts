import { CloseGroupProcessor } from './close-group.processor.js';
import type { ReceiptGroupsRepository } from '../../repository/receipt-groups.repository.js';
import type { ReceiptImagesRepository } from '../../repository/receipt-images.repository.js';
import type { ReceiptQueueService } from '../receipt-queue.service.js';
import type { ReceiptConfigService } from '../../receipt.config.js';
import type { ReceiptGroup } from '../../../database/schema/index.js';

const NOW = new Date('2026-09-04T12:00:00.000Z');
const secondsBefore = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000);

const group = (overrides: Partial<ReceiptGroup>): ReceiptGroup =>
  ({
    id: 'group-1',
    coupleId: 'couple-1',
    senderAddress: '+56912345678',
    status: 'collecting',
    lastImageAt: secondsBefore(120),
    ...overrides,
  }) as ReceiptGroup;

const build = (options: {
  byId?: ReceiptGroup | undefined;
  open?: ReceiptGroup | undefined;
  nextPageIndex?: number;
  closeSucceeds?: boolean;
}) => {
  const groups = {
    findById: jest.fn(() => Promise.resolve(options.byId)),
    findOpenBySender: jest.fn(() => Promise.resolve(options.open)),
    markExtracting: jest.fn(() =>
      Promise.resolve(options.closeSucceeds ?? true),
    ),
  };
  const images = {
    nextPageIndex: jest.fn(() => Promise.resolve(options.nextPageIndex ?? 3)),
  };
  const queue = {
    enqueueCloseGroup: jest.fn(() => Promise.resolve()),
    enqueueNotifyUser: jest.fn(() => Promise.resolve()),
    enqueueExtractGroup: jest.fn(() => Promise.resolve()),
  };
  const config = { groupWindowSeconds: 90 } as ReceiptConfigService;
  const processor = new CloseGroupProcessor(
    groups as unknown as ReceiptGroupsRepository,
    images as unknown as ReceiptImagesRepository,
    queue as unknown as ReceiptQueueService,
    config,
    () => NOW,
  );
  return { processor, groups, queue };
};

describe('CloseGroupProcessor', () => {
  it('cierra por ventana expirada y encola la extracción', async () => {
    const { processor, groups, queue } = build({
      byId: group({}),
      nextPageIndex: 3,
    });

    const result = await processor.process({
      kind: 'window',
      groupId: 'group-1',
      pageIndex: 2,
    });

    expect(result).toEqual({ outcome: 'closed', groupId: 'group-1' });
    expect(groups.markExtracting).toHaveBeenCalledWith('group-1', NOW);
    expect(queue.enqueueExtractGroup).toHaveBeenCalledWith({
      groupId: 'group-1',
      coupleId: 'couple-1',
      senderAddress: '+56912345678',
    });
    expect(queue.enqueueNotifyUser).not.toHaveBeenCalled();
  });

  it('reprograma si la ventana sigue abierta', async () => {
    const { processor, groups, queue } = build({
      byId: group({ lastImageAt: secondsBefore(30) }),
      nextPageIndex: 3,
    });

    const result = await processor.process({
      kind: 'window',
      groupId: 'group-1',
      pageIndex: 2,
    });

    expect(result).toEqual({ outcome: 'rescheduled', delayMs: 60 * 1000 });
    expect(queue.enqueueCloseGroup).toHaveBeenCalledWith(
      { kind: 'window', groupId: 'group-1', pageIndex: 2, reschedule: 1 },
      60 * 1000,
    );
    expect(groups.markExtracting).not.toHaveBeenCalled();
  });

  it('omite un job superado por una página posterior', async () => {
    const { processor, groups } = build({ byId: group({}), nextPageIndex: 4 });

    const result = await processor.process({
      kind: 'window',
      groupId: 'group-1',
      pageIndex: 2,
    });

    expect(result).toEqual({ outcome: 'skipped', reason: 'superseded' });
    expect(groups.markExtracting).not.toHaveBeenCalled();
  });

  it('omite si el grupo ya no existe o ya no está en collecting', async () => {
    const missing = build({ byId: undefined });
    const closed = build({ byId: group({ status: 'needs_review' }) });

    await expect(
      missing.processor.process({
        kind: 'window',
        groupId: 'group-1',
        pageIndex: 1,
      }),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'not_found' });
    await expect(
      closed.processor.process({
        kind: 'window',
        groupId: 'group-1',
        pageIndex: 1,
      }),
    ).resolves.toEqual({ outcome: 'skipped', reason: 'not_collecting' });
  });

  it('cierra de inmediato por comando sobre el grupo abierto del remitente', async () => {
    const { processor, groups, queue } = build({
      open: group({ lastImageAt: secondsBefore(5) }),
      nextPageIndex: 2,
    });

    const result = await processor.process({
      kind: 'command',
      senderAddress: '+56912345678',
      coupleId: 'couple-1',
    });

    expect(result).toEqual({ outcome: 'closed', groupId: 'group-1' });
    expect(groups.findOpenBySender).toHaveBeenCalledWith(
      '+56912345678',
      'couple-1',
    );
    expect(groups.markExtracting).toHaveBeenCalledWith('group-1', NOW);
    expect(queue.enqueueExtractGroup).toHaveBeenCalledWith({
      groupId: 'group-1',
      coupleId: 'couple-1',
      senderAddress: '+56912345678',
    });
    expect(queue.enqueueNotifyUser).not.toHaveBeenCalled();
  });

  it('omite y no notifica ni encola extracción si otro proceso ya cerró el grupo primero', async () => {
    const { processor, queue, groups } = build({
      byId: group({}),
      nextPageIndex: 3,
      closeSucceeds: false,
    });

    const result = await processor.process({
      kind: 'window',
      groupId: 'group-1',
      pageIndex: 2,
    });

    expect(result).toEqual({ outcome: 'skipped', reason: 'not_collecting' });
    expect(groups.markExtracting).toHaveBeenCalledWith('group-1', NOW);
    expect(queue.enqueueExtractGroup).not.toHaveBeenCalled();
    expect(queue.enqueueNotifyUser).not.toHaveBeenCalled();
  });

  it('avisa que no hay boleta abierta si el comando llega sin grupo', async () => {
    const { processor, queue } = build({ open: undefined });

    const result = await processor.process({
      kind: 'command',
      senderAddress: '+56912345678',
      coupleId: 'couple-1',
    });

    expect(result).toEqual({ outcome: 'no_open_group' });
    expect(queue.enqueueNotifyUser).toHaveBeenCalledWith({
      toAddress: '+56912345678',
      body: 'No tengo ninguna boleta abierta. Envíame la foto primero.',
    });
  });
});
