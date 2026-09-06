import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptMerchants } from '../../database/schema/index.js';
import type { ReceiptMerchant } from '../../database/schema/index.js';
import type { ScoredCandidate } from '../normalization/match-decision.js';
import { isUniqueViolation } from '../utils/postgres-errors.js';
import type { CandidateRow } from '../utils/scored-candidates.js';
import { toScoredCandidates } from '../utils/scored-candidates.js';

@Injectable()
export class ReceiptMerchantsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findByRut(
    coupleId: string,
    rut: string,
  ): Promise<ReceiptMerchant | undefined> {
    const rows = await this.db
      .select()
      .from(receiptMerchants)
      .where(
        and(
          eq(receiptMerchants.coupleId, coupleId),
          eq(receiptMerchants.rut, rut),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async findById(merchantId: string): Promise<ReceiptMerchant | undefined> {
    const rows = await this.db
      .select()
      .from(receiptMerchants)
      .where(eq(receiptMerchants.id, merchantId))
      .limit(1);
    return rows[0];
  }

  async findCandidates(
    coupleId: string,
    text: string,
    limit: number,
  ): Promise<ScoredCandidate[]> {
    const result = await this.db.execute(sql`
      select m.id, m.canonical_name,
        greatest(
          similarity(m.canonical_name, ${text}),
          coalesce((select max(similarity(a, ${text})) from unnest(m.aliases) as a), 0)
        ) as score
      from receipt_merchants m
      where m.couple_id = ${coupleId}
      order by score desc, m.id
      limit ${limit}
    `);
    return toScoredCandidates(
      (result as unknown as { rows: CandidateRow[] }).rows,
    );
  }

  async create(
    coupleId: string,
    canonicalName: string,
    rut: string | null,
  ): Promise<ReceiptMerchant> {
    try {
      const rows = await this.db
        .insert(receiptMerchants)
        .values({ coupleId, canonicalName, rut })
        .returning();
      const created = rows[0];
      if (created) return created;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return this.findByName(coupleId, canonicalName);
  }

  async setRut(merchantId: string, rut: string): Promise<void> {
    await this.db
      .update(receiptMerchants)
      .set({ rut })
      .where(
        and(eq(receiptMerchants.id, merchantId), isNull(receiptMerchants.rut)),
      );
  }

  async addAlias(merchantId: string, alias: string): Promise<void> {
    await this.db
      .update(receiptMerchants)
      .set({
        aliases: sql`array_append(${receiptMerchants.aliases}, ${alias})`,
      })
      .where(
        and(
          eq(receiptMerchants.id, merchantId),
          sql`not (${alias} = any(${receiptMerchants.aliases}))`,
        ),
      );
  }

  private async findByName(
    coupleId: string,
    canonicalName: string,
  ): Promise<ReceiptMerchant> {
    const rows = await this.db
      .select()
      .from(receiptMerchants)
      .where(
        and(
          eq(receiptMerchants.coupleId, coupleId),
          eq(receiptMerchants.canonicalName, canonicalName),
        ),
      )
      .limit(1);
    const found = rows[0];
    if (!found) throw new Error('receipt_merchant_not_found_after_conflict');
    return found;
  }
}
