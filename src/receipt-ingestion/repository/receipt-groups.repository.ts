import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptGroups } from '../../database/schema/index.js';
import type {
  NewReceiptGroup,
  ReceiptGroup,
} from '../../database/schema/index.js';
import { RECEIPT_REVIEW_REASON_EXTRACTION_PENDING } from '../receipt.constants.js';

export class ReceiptGroupInsertError extends Error {
  constructor() {
    super('receipt_group_insert_returned_no_row');
    this.name = 'ReceiptGroupInsertError';
  }
}

@Injectable()
export class ReceiptGroupsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findOpenBySender(
    senderPhoneE164: string,
    coupleId: string,
  ): Promise<ReceiptGroup | undefined> {
    const rows = await this.db
      .select()
      .from(receiptGroups)
      .where(
        and(
          eq(receiptGroups.senderPhoneE164, senderPhoneE164),
          eq(receiptGroups.coupleId, coupleId),
          eq(receiptGroups.status, 'collecting'),
        ),
      )
      .orderBy(desc(receiptGroups.createdAt))
      .limit(1);
    return rows[0];
  }

  async create(values: NewReceiptGroup): Promise<ReceiptGroup> {
    const rows = await this.db.insert(receiptGroups).values(values).returning();
    const created = rows[0];
    if (!created) throw new ReceiptGroupInsertError();
    return created;
  }

  async touchLastImageAt(groupId: string, at: Date): Promise<void> {
    await this.db
      .update(receiptGroups)
      .set({ lastImageAt: at })
      .where(eq(receiptGroups.id, groupId));
  }

  async findById(groupId: string): Promise<ReceiptGroup | undefined> {
    const rows = await this.db
      .select()
      .from(receiptGroups)
      .where(eq(receiptGroups.id, groupId))
      .limit(1);
    return rows[0];
  }

  async closeAsPendingExtraction(
    groupId: string,
    closedAt: Date,
  ): Promise<void> {
    await this.db
      .update(receiptGroups)
      .set({
        status: 'needs_review',
        reviewReasons: [RECEIPT_REVIEW_REASON_EXTRACTION_PENDING],
        closedAt,
      })
      .where(
        and(
          eq(receiptGroups.id, groupId),
          eq(receiptGroups.status, 'collecting'),
        ),
      );
  }
}
