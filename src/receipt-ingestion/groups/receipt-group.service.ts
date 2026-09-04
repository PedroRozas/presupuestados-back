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

const UNIQUE_VIOLATION_CODE = '23505';

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE;

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

    return this.createOrReuse(input);
  }

  private async createOrReuse(
    input: ResolveOpenGroupInput,
  ): Promise<ReceiptGroup> {
    try {
      return await this.groups.create({
        coupleId: input.coupleId,
        createdByUserId: input.userId,
        senderPhoneE164: input.senderPhoneE164,
        lastImageAt: input.receivedAt,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await this.groups.findOpenBySender(
        input.senderPhoneE164,
        input.coupleId,
      );
      if (!concurrent) throw error;
      return concurrent;
    }
  }
}
