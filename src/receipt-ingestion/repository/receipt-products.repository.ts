import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { receiptProducts } from '../../database/schema/index.js';
import type { ReceiptProduct } from '../../database/schema/index.js';
import type { ReceiptProductCategory } from '../receipt.constants.js';
import type { ScoredCandidate } from '../normalization/match-decision.js';
import { isUniqueViolation } from '../utils/postgres-errors.js';
import type { CandidateRow } from '../utils/scored-candidates.js';
import { toScoredCandidates } from '../utils/scored-candidates.js';

@Injectable()
export class ReceiptProductsRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findCandidates(
    coupleId: string,
    text: string,
    limit: number,
  ): Promise<ScoredCandidate[]> {
    const result = await this.db.execute(sql`
      select p.id, p.canonical_name,
        greatest(
          similarity(p.canonical_name, ${text}),
          coalesce((select max(similarity(a, ${text})) from unnest(p.aliases) as a), 0)
        ) as score
      from receipt_products p
      where p.couple_id = ${coupleId}
      order by score desc, p.id
      limit ${limit}
    `);
    return toScoredCandidates(
      (result as unknown as { rows: CandidateRow[] }).rows,
    );
  }

  async create(
    coupleId: string,
    canonicalName: string,
    defaultCategory: ReceiptProductCategory,
    aliases: string[] = [],
  ): Promise<ReceiptProduct> {
    try {
      const rows = await this.db
        .insert(receiptProducts)
        .values({ coupleId, canonicalName, defaultCategory, aliases })
        .returning();
      const created = rows[0];
      if (created) return created;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
    return this.findByName(coupleId, canonicalName);
  }

  async listByIds(
    coupleId: string,
    productIds: string[],
  ): Promise<ReceiptProduct[]> {
    if (productIds.length === 0) return [];
    return this.db
      .select()
      .from(receiptProducts)
      .where(
        and(
          eq(receiptProducts.coupleId, coupleId),
          inArray(receiptProducts.id, productIds),
        ),
      );
  }

  async addAlias(productId: string, alias: string): Promise<void> {
    await this.db
      .update(receiptProducts)
      .set({ aliases: sql`array_append(${receiptProducts.aliases}, ${alias})` })
      .where(
        and(
          eq(receiptProducts.id, productId),
          sql`not (${alias} = any(${receiptProducts.aliases}))`,
        ),
      );
  }

  private async findByName(
    coupleId: string,
    canonicalName: string,
  ): Promise<ReceiptProduct> {
    const rows = await this.db
      .select()
      .from(receiptProducts)
      .where(
        and(
          eq(receiptProducts.coupleId, coupleId),
          eq(receiptProducts.canonicalName, canonicalName),
        ),
      )
      .limit(1);
    const found = rows[0];
    if (!found) throw new Error('receipt_product_not_found_after_conflict');
    return found;
  }
}
