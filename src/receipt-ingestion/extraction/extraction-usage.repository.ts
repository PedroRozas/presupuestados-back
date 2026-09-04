import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';

@Injectable()
export class ExtractionUsageRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async tryReserve(
    coupleId: string,
    periodMonth: string,
    cap: number,
  ): Promise<boolean> {
    const result = await this.db.execute(sql`
      insert into receipt_extraction_usage (couple_id, period_month, usage_count)
      values (${coupleId}, ${periodMonth}, 1)
      on conflict (couple_id, period_month)
      do update set
        usage_count = receipt_extraction_usage.usage_count + 1,
        updated_at = now()
      where receipt_extraction_usage.usage_count < ${cap}
      returning usage_count
    `);
    const rows = (result as unknown as { rows: unknown[] }).rows;
    return rows.length > 0;
  }
}
