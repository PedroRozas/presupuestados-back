import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptItems } from '../../database/schema/index.js';
import type { NewReceiptItem } from '../../database/schema/index.js';

@Injectable()
export class ReceiptItemsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async replaceForGroup(
    groupId: string,
    items: NewReceiptItem[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(receiptItems).where(eq(receiptItems.groupId, groupId));
      if (items.length > 0) {
        await tx.insert(receiptItems).values(items);
      }
    });
  }
}
