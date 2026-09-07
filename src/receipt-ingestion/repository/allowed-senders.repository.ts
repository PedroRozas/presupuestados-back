import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptAllowedSenders } from '../../database/schema/index.js';
import type { ReceiptAllowedSender } from '../../database/schema/index.js';

@Injectable()
export class AllowedSendersRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findEnabledByPhone(
    phoneE164: string,
  ): Promise<ReceiptAllowedSender | undefined> {
    const rows = await this.db
      .select()
      .from(receiptAllowedSenders)
      .where(
        and(
          eq(receiptAllowedSenders.phoneE164, phoneE164),
          eq(receiptAllowedSenders.enabled, true),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async findEnabledByUserId(
    userId: string,
  ): Promise<ReceiptAllowedSender | undefined> {
    const rows = await this.db
      .select()
      .from(receiptAllowedSenders)
      .where(
        and(
          eq(receiptAllowedSenders.userId, userId),
          eq(receiptAllowedSenders.enabled, true),
        ),
      )
      .limit(1);
    return rows[0];
  }
}
