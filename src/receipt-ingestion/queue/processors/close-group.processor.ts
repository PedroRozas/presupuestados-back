import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ReceiptGroup } from '../../../database/schema/index.js';
import { decideCloseAction } from '../../groups/close-group-decision.js';
import { ReceiptConfigService } from '../../receipt.config.js';
import { ReceiptGroupsRepository } from '../../repository/receipt-groups.repository.js';
import { ReceiptImagesRepository } from '../../repository/receipt-images.repository.js';
import {
  buildGroupClosedMessage,
  buildNoOpenGroupMessage,
} from '../../whatsapp/receipt-notifications.js';
import { ReceiptQueueService } from '../receipt-queue.service.js';
import type {
  CloseGroupByCommandPayload,
  CloseGroupJobPayload,
} from '../receipt-queue.constants.js';

export type CloseSkipReason = 'not_collecting' | 'superseded' | 'not_found';

export type CloseGroupResult =
  | { outcome: 'closed'; groupId: string }
  | { outcome: 'rescheduled'; delayMs: number }
  | { outcome: 'skipped'; reason: CloseSkipReason }
  | { outcome: 'no_open_group' };

export const CLOSE_GROUP_CLOCK = Symbol('CLOSE_GROUP_CLOCK');
export type Clock = () => Date;
const systemClock: Clock = () => new Date();

@Injectable()
export class CloseGroupProcessor {
  private readonly logger = new Logger(CloseGroupProcessor.name);
  private readonly now: Clock;

  constructor(
    private readonly groups: ReceiptGroupsRepository,
    private readonly images: ReceiptImagesRepository,
    private readonly queue: ReceiptQueueService,
    private readonly config: ReceiptConfigService,
    @Optional() @Inject(CLOSE_GROUP_CLOCK) clock?: Clock,
  ) {
    this.now = clock ?? systemClock;
  }

  async process(payload: CloseGroupJobPayload): Promise<CloseGroupResult> {
    const group = await this.resolveGroup(payload);
    if (!group) {
      return this.handleMissingGroup(payload);
    }

    const lastPageIndex = (await this.images.nextPageIndex(group.id)) - 1;
    const decision = decideCloseAction({
      status: group.status,
      lastImageAt: group.lastImageAt,
      lastPageIndex,
      trigger:
        payload.kind === 'window'
          ? { kind: 'window', pageIndex: payload.pageIndex }
          : { kind: 'command' },
      now: this.now(),
      windowSeconds: this.config.groupWindowSeconds,
    });

    if (decision.action === 'skip') {
      return { outcome: 'skipped', reason: decision.reason };
    }
    if (decision.action === 'reschedule') {
      return this.reschedule(payload, decision.delayMs);
    }
    return this.close(group, lastPageIndex);
  }

  private async reschedule(
    payload: CloseGroupJobPayload,
    delayMs: number,
  ): Promise<CloseGroupResult> {
    if (payload.kind === 'command') {
      return { outcome: 'skipped', reason: 'not_collecting' };
    }
    await this.queue.enqueueCloseGroup(
      { ...payload, reschedule: (payload.reschedule ?? 0) + 1 },
      delayMs,
    );
    return { outcome: 'rescheduled', delayMs };
  }

  private resolveGroup(
    payload: CloseGroupJobPayload,
  ): Promise<ReceiptGroup | undefined> {
    return payload.kind === 'window'
      ? this.groups.findById(payload.groupId)
      : this.groups.findOpenBySender(payload.senderPhoneE164, payload.coupleId);
  }

  private async handleMissingGroup(
    payload: CloseGroupJobPayload,
  ): Promise<CloseGroupResult> {
    if (payload.kind === 'window') {
      return { outcome: 'skipped', reason: 'not_found' };
    }
    await this.notifyNoOpenGroup(payload);
    return { outcome: 'no_open_group' };
  }

  private async notifyNoOpenGroup(
    payload: CloseGroupByCommandPayload,
  ): Promise<void> {
    await this.queue.enqueueNotifyUser({
      toPhoneE164: payload.senderPhoneE164,
      body: buildNoOpenGroupMessage(),
    });
  }

  private async close(
    group: ReceiptGroup,
    lastPageIndex: number,
  ): Promise<CloseGroupResult> {
    const closed = await this.groups.closeAsPendingExtraction(
      group.id,
      this.now(),
    );
    if (!closed) {
      return { outcome: 'skipped', reason: 'not_collecting' };
    }
    await this.queue.enqueueNotifyUser({
      toPhoneE164: group.senderPhoneE164,
      body: buildGroupClosedMessage({ pageCount: lastPageIndex }),
    });
    this.logger.log(`group_closed group=${group.id} pages=${lastPageIndex}`);
    return { outcome: 'closed', groupId: group.id };
  }
}
