import { Injectable } from '@nestjs/common';
import type { ReceiptGroup } from '../../database/schema/index.js';
import { ReceiptConfigService } from '../receipt.config.js';
import { ReceiptGroupsRepository } from '../repository/receipt-groups.repository.js';
import { isWithinGroupWindow } from './group-window.js';

export interface ResolveOpenGroupInput {
  senderPhoneE164: string;
  coupleId: string;
  userId: string;
  receivedAt: Date;
}

@Injectable()
export class ReceiptGroupService {
  constructor(
    private readonly groups: ReceiptGroupsRepository,
    private readonly config: ReceiptConfigService,
  ) {}

  async resolveOpenGroup(input: ResolveOpenGroupInput): Promise<ReceiptGroup> {
    const open = await this.groups.findOpenBySender(
      input.senderPhoneE164,
      input.coupleId,
    );

    if (
      open &&
      isWithinGroupWindow({
        lastImageAt: open.lastImageAt,
        receivedAt: input.receivedAt,
        windowSeconds: this.config.groupWindowSeconds,
      })
    ) {
      return open;
    }

    return this.groups.create({
      coupleId: input.coupleId,
      createdByUserId: input.userId,
      senderPhoneE164: input.senderPhoneE164,
      lastImageAt: input.receivedAt,
    });
  }
}
