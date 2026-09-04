import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, max } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptImages } from '../../database/schema/index.js';
import type {
  NewReceiptImage,
  ReceiptImage,
} from '../../database/schema/index.js';

export class ReceiptImageInsertError extends Error {
  constructor() {
    super('receipt_image_insert_returned_no_row');
    this.name = 'ReceiptImageInsertError';
  }
}

@Injectable()
export class ReceiptImagesRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async existsByMessageId(waMessageId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: receiptImages.id })
      .from(receiptImages)
      .where(eq(receiptImages.waMessageId, waMessageId))
      .limit(1);
    return rows.length > 0;
  }

  async existsBySha256(coupleId: string, sha256: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: receiptImages.id })
      .from(receiptImages)
      .where(
        and(
          eq(receiptImages.coupleId, coupleId),
          eq(receiptImages.sha256, sha256),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async nextPageIndex(groupId: string): Promise<number> {
    const rows = await this.db
      .select({ maxPage: max(receiptImages.pageIndex) })
      .from(receiptImages)
      .where(eq(receiptImages.groupId, groupId));
    const maxPage = rows[0]?.maxPage;
    return (maxPage ?? 0) + 1;
  }

  async create(values: NewReceiptImage): Promise<ReceiptImage> {
    const rows = await this.db.insert(receiptImages).values(values).returning();
    const created = rows[0];
    if (!created) throw new ReceiptImageInsertError();
    return created;
  }

  async listByGroup(groupId: string): Promise<ReceiptImage[]> {
    return this.db
      .select()
      .from(receiptImages)
      .where(eq(receiptImages.groupId, groupId))
      .orderBy(asc(receiptImages.pageIndex));
  }
}
