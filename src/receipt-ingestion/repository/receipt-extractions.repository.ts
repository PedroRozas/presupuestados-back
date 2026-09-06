import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptExtractions } from '../../database/schema/index.js';
import type {
  NewReceiptExtraction,
  ReceiptExtraction,
} from '../../database/schema/index.js';
import { RECEIPT_EXTRACTION_STATUS } from '../receipt.constants.js';

export class ReceiptExtractionInsertError extends Error {
  constructor() {
    super('receipt_extraction_insert_returned_no_row');
    this.name = 'ReceiptExtractionInsertError';
  }
}

@Injectable()
export class ReceiptExtractionsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(values: NewReceiptExtraction): Promise<ReceiptExtraction> {
    const rows = await this.db
      .insert(receiptExtractions)
      .values(values)
      .returning();
    const created = rows[0];
    if (!created) throw new ReceiptExtractionInsertError();
    return created;
  }

  async findLatestSucceeded(
    groupId: string,
  ): Promise<ReceiptExtraction | undefined> {
    const rows = await this.db
      .select()
      .from(receiptExtractions)
      .where(
        and(
          eq(receiptExtractions.groupId, groupId),
          eq(receiptExtractions.status, RECEIPT_EXTRACTION_STATUS.SUCCEEDED),
        ),
      )
      .orderBy(desc(receiptExtractions.createdAt))
      .limit(1);
    return rows[0];
  }
}
