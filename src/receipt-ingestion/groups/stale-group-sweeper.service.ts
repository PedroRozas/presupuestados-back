import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ReceiptQueueService } from '../queue/receipt-queue.service.js';
import { ReceiptConfigService } from '../receipt.config.js';
import { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from '../repository/receipt-images.repository.js';

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_MINUTE = 60 * MILLISECONDS_PER_SECOND;
const COLLECTING_STALE_WINDOW_MULTIPLIER = 2;

export interface SweepResult {
  reenqueuedExtracting: number;
  reenqueuedCollecting: number;
}

export const STALE_GROUP_SWEEPER_CLOCK = Symbol('STALE_GROUP_SWEEPER_CLOCK');
export type Clock = () => Date;
const systemClock: Clock = () => new Date();

@Injectable()
export class StaleGroupSweeperService {
  private readonly logger = new Logger(StaleGroupSweeperService.name);
  private readonly now: Clock;

  constructor(
    private readonly groups: ReceiptGroupsRepository,
    private readonly images: ReceiptImagesRepository,
    private readonly queue: ReceiptQueueService,
    private readonly config: ReceiptConfigService,
    @Optional() @Inject(STALE_GROUP_SWEEPER_CLOCK) clock?: Clock,
  ) {
    this.now = clock ?? systemClock;
  }

  async sweep(): Promise<SweepResult> {
    const now = this.now();
    const reenqueuedExtracting = await this.sweepStaleExtracting(now);
    const reenqueuedCollecting = await this.sweepStaleCollecting(now);
    this.logger.log(
      `sweep_done extracting=${reenqueuedExtracting} collecting=${reenqueuedCollecting}`,
    );
    return { reenqueuedExtracting, reenqueuedCollecting };
  }

  private async sweepStaleExtracting(now: Date): Promise<number> {
    const threshold = new Date(
      now.getTime() -
        this.config.staleExtractingMinutes * MILLISECONDS_PER_MINUTE,
    );
    const staleGroups = await this.groups.findStaleExtracting(threshold);
    for (const group of staleGroups) {
      await this.queue.enqueueExtractGroup({
        groupId: group.id,
        coupleId: group.coupleId,
        senderPhoneE164: group.senderPhoneE164,
      });
    }
    return staleGroups.length;
  }

  private async sweepStaleCollecting(now: Date): Promise<number> {
    const threshold = new Date(
      now.getTime() -
        COLLECTING_STALE_WINDOW_MULTIPLIER *
          this.config.groupWindowSeconds *
          MILLISECONDS_PER_SECOND,
    );
    const staleGroups = await this.groups.findStaleCollecting(threshold);
    for (const group of staleGroups) {
      const pageIndex = (await this.images.nextPageIndex(group.id)) - 1;
      await this.queue.enqueueCloseGroup(
        { kind: 'window', groupId: group.id, pageIndex },
        0,
      );
    }
    return staleGroups.length;
  }
}
