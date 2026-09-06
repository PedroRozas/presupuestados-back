import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../database/database.module.js';
import * as schema from '../../database/schema/index.js';
import { RECEIPT_PERIOD_TIME_ZONE } from '../receipt.constants.js';
import type { ReceiptGroupStatus } from '../receipt.constants.js';

export interface GroupListRow {
  id: string;
  status: ReceiptGroupStatus;
  receiptDate: string | null;
  merchantRaw: string | null;
  merchantName: string | null;
  totalDeclared: string | null;
  reviewReasons: string[];
  pageCount: number;
  itemCount: number;
  createdAt: Date;
  closedAt: Date | null;
}

export interface CategorySummary {
  category: string;
  amount: string;
  itemCount: number;
}

export interface MonthSummary {
  total: string;
  receiptCount: number;
  byCategory: CategorySummary[];
}

export interface ComparisonMonthRow {
  year: number;
  month: number;
  total: string;
  byCategory: CategorySummary[];
}

interface GroupListSqlRow {
  id: string;
  status: ReceiptGroupStatus;
  receipt_date: string | null;
  merchant_raw: string | null;
  merchant_name: string | null;
  total_declared: string | null;
  review_reasons: string[];
  page_count: number;
  item_count: number;
  created_at: Date;
  closed_at: Date | null;
}

interface CategorySummarySqlRow {
  category: string;
  amount: string;
  item_count: number;
}

interface MonthTotalsSqlRow {
  total: string;
  receipt_count: number;
}

interface ComparisonTotalSqlRow {
  year: number;
  month: number;
  total: string;
}

interface ComparisonCategorySqlRow {
  year: number;
  month: number;
  category: string;
  amount: string;
  item_count: number;
}

export function mapGroupListRow(row: GroupListSqlRow): GroupListRow {
  return {
    id: row.id,
    status: row.status,
    receiptDate: row.receipt_date,
    merchantRaw: row.merchant_raw,
    merchantName: row.merchant_name,
    totalDeclared: row.total_declared,
    reviewReasons: row.review_reasons,
    pageCount: row.page_count,
    itemCount: row.item_count,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

export function mapCategorySummaryRow(
  row: CategorySummarySqlRow,
): CategorySummary {
  return {
    category: row.category,
    amount: row.amount,
    itemCount: row.item_count,
  };
}

export function buildComparisonRows(
  totalsRows: ComparisonTotalSqlRow[],
  categoryRows: ComparisonCategorySqlRow[],
): ComparisonMonthRow[] {
  return totalsRows.map((row) => ({
    year: row.year,
    month: row.month,
    total: row.total,
    byCategory: categoryRows
      .filter((c) => c.year === row.year && c.month === row.month)
      .map(mapCategorySummaryRow),
  }));
}

@Injectable()
export class ReceiptQueryRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async listGroupsForMonth(
    coupleId: string,
    year: number,
    month: number,
  ): Promise<GroupListRow[]> {
    const result = await this.db.execute(sql`
      select
        g.id,
        g.status,
        g.receipt_date::text as receipt_date,
        g.merchant_raw,
        m.canonical_name as merchant_name,
        g.total_declared,
        g.review_reasons,
        (select count(*)::int from receipt_images i where i.group_id = g.id) as page_count,
        (select count(*)::int from receipt_items it where it.group_id = g.id) as item_count,
        g.created_at,
        g.closed_at
      from receipt_groups g
      left join receipt_merchants m on m.id = g.merchant_id
      where g.couple_id = ${coupleId}
        and g.status != 'discarded'
        and g.receipt_date >= make_date(${year}, ${month}, 1)
        and g.receipt_date < make_date(${year}, ${month}, 1) + interval '1 month'
      order by g.receipt_date desc, g.created_at desc
    `);
    return (result as unknown as { rows: GroupListSqlRow[] }).rows.map(
      mapGroupListRow,
    );
  }

  async listUndatedGroups(coupleId: string): Promise<GroupListRow[]> {
    const result = await this.db.execute(sql`
      select
        g.id,
        g.status,
        g.receipt_date::text as receipt_date,
        g.merchant_raw,
        m.canonical_name as merchant_name,
        g.total_declared,
        g.review_reasons,
        (select count(*)::int from receipt_images i where i.group_id = g.id) as page_count,
        (select count(*)::int from receipt_items it where it.group_id = g.id) as item_count,
        g.created_at,
        g.closed_at
      from receipt_groups g
      left join receipt_merchants m on m.id = g.merchant_id
      where g.couple_id = ${coupleId}
        and g.receipt_date is null
        and g.status != 'discarded'
      order by g.created_at desc
    `);
    return (result as unknown as { rows: GroupListSqlRow[] }).rows.map(
      mapGroupListRow,
    );
  }

  async summaryForMonth(
    coupleId: string,
    year: number,
    month: number,
  ): Promise<MonthSummary> {
    const totalsResult = await this.db.execute(sql`
      select
        coalesce(sum(i.amount), 0) as total,
        count(distinct g.id)::int as receipt_count
      from receipt_groups g
      left join receipt_items i on i.group_id = g.id
      where g.couple_id = ${coupleId}
        and g.status = 'ready'
        and g.receipt_date >= make_date(${year}, ${month}, 1)
        and g.receipt_date < make_date(${year}, ${month}, 1) + interval '1 month'
    `);
    const categoriesResult = await this.db.execute(sql`
      select i.category, sum(i.amount) as amount, count(*)::int as item_count
      from receipt_items i
      join receipt_groups g on g.id = i.group_id
      where g.couple_id = ${coupleId}
        and g.status = 'ready'
        and g.receipt_date >= make_date(${year}, ${month}, 1)
        and g.receipt_date < make_date(${year}, ${month}, 1) + interval '1 month'
      group by i.category
      order by amount desc
    `);
    const totalsRow = (totalsResult as unknown as { rows: MonthTotalsSqlRow[] })
      .rows[0];
    const categoryRows = (
      categoriesResult as unknown as { rows: CategorySummarySqlRow[] }
    ).rows;
    return {
      total: totalsRow?.total ?? '0',
      receiptCount: totalsRow?.receipt_count ?? 0,
      byCategory: categoryRows.map(mapCategorySummaryRow),
    };
  }

  async comparison(
    coupleId: string,
    months: number,
  ): Promise<ComparisonMonthRow[]> {
    const [totals, categories] = await Promise.all([
      this.comparisonTotals(coupleId, months),
      this.comparisonCategories(coupleId, months),
    ]);
    return buildComparisonRows(totals, categories);
  }

  private monthSeriesJoin(coupleId: string, months: number): SQL {
    return sql`
      from generate_series(
        date_trunc('month', now() at time zone ${RECEIPT_PERIOD_TIME_ZONE}) - (${months}::int - 1) * interval '1 month',
        date_trunc('month', now() at time zone ${RECEIPT_PERIOD_TIME_ZONE}),
        interval '1 month'
      ) as month_start
      left join receipt_groups g
        on g.couple_id = ${coupleId}
        and g.status = 'ready'
        and g.receipt_date >= month_start
        and g.receipt_date < month_start + interval '1 month'
    `;
  }

  private async comparisonTotals(
    coupleId: string,
    months: number,
  ): Promise<ComparisonTotalSqlRow[]> {
    const result = await this.db.execute(sql`
      select
        extract(year from month_start)::int as year,
        extract(month from month_start)::int as month,
        coalesce(sum(i.amount), 0) as total
      ${this.monthSeriesJoin(coupleId, months)}
      left join receipt_items i on i.group_id = g.id
      group by month_start
      order by month_start
    `);
    return (result as unknown as { rows: ComparisonTotalSqlRow[] }).rows;
  }

  private async comparisonCategories(
    coupleId: string,
    months: number,
  ): Promise<ComparisonCategorySqlRow[]> {
    const result = await this.db.execute(sql`
      select
        extract(year from month_start)::int as year,
        extract(month from month_start)::int as month,
        i.category,
        sum(i.amount) as amount,
        count(*)::int as item_count
      ${this.monthSeriesJoin(coupleId, months)}
      join receipt_items i on i.group_id = g.id
      group by month_start, i.category
      order by month_start, i.category
    `);
    return (result as unknown as { rows: ComparisonCategorySqlRow[] }).rows;
  }
}
