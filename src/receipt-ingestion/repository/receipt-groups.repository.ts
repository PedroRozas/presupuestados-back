import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptGroups } from '../../database/schema/index.js';
import type {
  NewReceiptGroup,
  ReceiptGroup,
} from '../../database/schema/index.js';
import type {
  ReceiptReviewReason,
  ReceiptSourceKind,
} from '../receipt.constants.js';

export class ReceiptGroupInsertError extends Error {
  constructor() {
    super('receipt_group_insert_returned_no_row');
    this.name = 'ReceiptGroupInsertError';
  }
}

export interface ExtractionHeader {
  status: 'ready' | 'needs_review';
  reviewReasons: ReceiptReviewReason[];
  merchantRaw: string | null;
  merchantRut: string | null;
  receiptDate: string | null;
  totalDeclared: string | null;
  currency: string;
  sourceKind: ReceiptSourceKind;
}

export interface ReceiptGroupHeaderPatch {
  receiptDate?: string | null;
  merchantRaw?: string | null;
  totalDeclared?: string | null;
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

  async findByIdForCouple(
    groupId: string,
    coupleId: string,
  ): Promise<ReceiptGroup | undefined> {
    const rows = await this.db
      .select()
      .from(receiptGroups)
      .where(
        and(
          eq(receiptGroups.id, groupId),
          eq(receiptGroups.coupleId, coupleId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async updateHeader(
    groupId: string,
    patch: ReceiptGroupHeaderPatch,
  ): Promise<void> {
    if (Object.keys(patch).length === 0) return;
    await this.db
      .update(receiptGroups)
      .set(patch)
      .where(eq(receiptGroups.id, groupId));
  }

  async setStatusAndReasons(
    groupId: string,
    status: 'ready' | 'needs_review' | 'discarded',
    reasons: ReceiptReviewReason[],
  ): Promise<void> {
    await this.db
      .update(receiptGroups)
      .set({ status, reviewReasons: reasons })
      .where(eq(receiptGroups.id, groupId));
  }

  async markExtracting(groupId: string, closedAt: Date): Promise<boolean> {
    const rows = await this.db
      .update(receiptGroups)
      .set({ status: 'extracting', closedAt })
      .where(
        and(
          eq(receiptGroups.id, groupId),
          eq(receiptGroups.status, 'collecting'),
        ),
      )
      .returning({ id: receiptGroups.id });
    return rows.length > 0;
  }

  async applyExtraction(
    groupId: string,
    header: ExtractionHeader,
  ): Promise<void> {
    await this.db
      .update(receiptGroups)
      .set({
        status: header.status,
        reviewReasons: header.reviewReasons,
        merchantRaw: header.merchantRaw,
        merchantRut: header.merchantRut,
        receiptDate: header.receiptDate,
        totalDeclared: header.totalDeclared,
        currency: header.currency,
        sourceKind: header.sourceKind,
      })
      .where(eq(receiptGroups.id, groupId));
  }

  async markFailed(
    groupId: string,
    reviewReasons: ReceiptReviewReason[],
  ): Promise<boolean> {
    const rows = await this.db
      .update(receiptGroups)
      .set({ status: 'failed', reviewReasons })
      .where(
        and(
          eq(receiptGroups.id, groupId),
          eq(receiptGroups.status, 'extracting'),
        ),
      )
      .returning({ id: receiptGroups.id });
    return rows.length > 0;
  }

  async setMerchant(groupId: string, merchantId: string): Promise<void> {
    await this.db
      .update(receiptGroups)
      .set({ merchantId })
      .where(eq(receiptGroups.id, groupId));
  }

  async findStaleExtracting(olderThan: Date): Promise<ReceiptGroup[]> {
    return this.db
      .select()
      .from(receiptGroups)
      .where(
        and(
          eq(receiptGroups.status, 'extracting'),
          lt(receiptGroups.closedAt, olderThan),
        ),
      );
  }

  async findStaleCollecting(olderThan: Date): Promise<ReceiptGroup[]> {
    return this.db
      .select()
      .from(receiptGroups)
      .where(
        and(
          eq(receiptGroups.status, 'collecting'),
          lt(receiptGroups.lastImageAt, olderThan),
        ),
      );
  }
}
