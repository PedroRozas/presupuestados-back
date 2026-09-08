import { StaleGroupSweeperService } from './stale-group-sweeper.service.js';
import type { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import type { ReceiptImagesRepository } from '../repository/receipt-images.repository.js';
import type { ReceiptQueueService } from '../queue/receipt-queue.service.js';
import type { ReceiptConfigService } from '../receipt.config.js';
import type { ReceiptGroup } from '../../database/schema/index.js';

const NOW = new Date('2026-09-05T12:00:00.000Z');

const group = (overrides: Partial<ReceiptGroup>): ReceiptGroup =>
  ({
    id: 'group-1',
    coupleId: 'couple-1',
    senderAddress: '+56912345678',
    status: 'extracting',
    ...overrides,
  }) as ReceiptGroup;

const build = (options: {
  staleExtracting?: ReceiptGroup[];
  staleCollecting?: ReceiptGroup[];
  nextPageIndex?: number;
}) => {
  const groups = {
    findStaleExtracting: jest.fn(() =>
      Promise.resolve(options.staleExtracting ?? []),
    ),
    findStaleCollecting: jest.fn(() =>
      Promise.resolve(options.staleCollecting ?? []),
    ),
  };
  const images = {
    nextPageIndex: jest.fn(() => Promise.resolve(options.nextPageIndex ?? 1)),
  };
  const queue = {
    enqueueExtractGroup: jest.fn(() => Promise.resolve()),
    enqueueCloseGroup: jest.fn(() => Promise.resolve()),
  };
  const config = {
    staleExtractingMinutes: 30,
    groupWindowSeconds: 90,
  } as ReceiptConfigService;
  const service = new StaleGroupSweeperService(
    groups as unknown as ReceiptGroupsRepository,
    images as unknown as ReceiptImagesRepository,
    queue as unknown as ReceiptQueueService,
    config,
    () => NOW,
  );
  return { service, groups, images, queue };
};

describe('StaleGroupSweeperService', () => {
  it('reencola exactamente los grupos devueltos por los repositorios', async () => {
    const extractingGroup = group({
      id: 'g-extracting',
      status: 'extracting',
    });
    const collectingGroup = group({
      id: 'g-collecting',
      status: 'collecting',
      coupleId: 'couple-2',
      senderAddress: '+56987654321',
    });
    const { service, groups, queue, images } = build({
      staleExtracting: [extractingGroup],
      staleCollecting: [collectingGroup],
      nextPageIndex: 4,
    });

    const result = await service.sweep();

    expect(result).toEqual({
      reenqueuedExtracting: 1,
      reenqueuedCollecting: 1,
    });
    expect(queue.enqueueExtractGroup).toHaveBeenCalledTimes(1);
    expect(queue.enqueueExtractGroup).toHaveBeenCalledWith({
      groupId: 'g-extracting',
      coupleId: 'couple-1',
      senderAddress: '+56912345678',
    });
    expect(images.nextPageIndex).toHaveBeenCalledWith('g-collecting');
    expect(queue.enqueueCloseGroup).toHaveBeenCalledTimes(1);
    expect(queue.enqueueCloseGroup).toHaveBeenCalledWith(
      { kind: 'window', groupId: 'g-collecting', pageIndex: 3 },
      0,
    );
    expect(groups.findStaleExtracting).toHaveBeenCalledWith(
      expect.any(Date) as Date,
    );
    expect(groups.findStaleCollecting).toHaveBeenCalledWith(
      expect.any(Date) as Date,
    );
  });

  it('sin grupos huérfanos no encola nada', async () => {
    const { service, queue } = build({});

    const result = await service.sweep();

    expect(result).toEqual({
      reenqueuedExtracting: 0,
      reenqueuedCollecting: 0,
    });
    expect(queue.enqueueExtractGroup).not.toHaveBeenCalled();
    expect(queue.enqueueCloseGroup).not.toHaveBeenCalled();
  });

  it('calcula los umbrales a partir de la configuración', async () => {
    const { service, groups } = build({});

    await service.sweep();

    const [staleExtractingArg] = groups.findStaleExtracting.mock.calls[0] as [
      Date,
    ];
    const [staleCollectingArg] = groups.findStaleCollecting.mock.calls[0] as [
      Date,
    ];
    expect(staleExtractingArg).toEqual(
      new Date(NOW.getTime() - 30 * 60 * 1000),
    );
    expect(staleCollectingArg).toEqual(new Date(NOW.getTime() - 2 * 90 * 1000));
  });
});
