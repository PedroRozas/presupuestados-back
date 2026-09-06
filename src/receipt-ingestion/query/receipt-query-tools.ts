import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { LlmToolCall, LlmToolDefinition } from '../llm/llm.interfaces.js';
import { RECEIPT_DEFAULTS } from '../receipt.constants.js';
import { ReceiptQueryRepository } from '../repository/receipt-query.repository.js';
import {
  CATEGORY_SPEND_JSON_SCHEMA,
  categorySpendArgsSchema,
  MONTH_SUMMARY_JSON_SCHEMA,
  monthSummaryArgsSchema,
  QUERY_TOOL_NAMES,
  SEARCH_ITEMS_JSON_SCHEMA,
  searchItemsArgsSchema,
  TOP_PRODUCTS_JSON_SCHEMA,
  topProductsArgsSchema,
  type CategorySpendArgs,
  type MonthSummaryArgs,
  type SearchItemsArgs,
  type TopProductsArgs,
} from './query-tools.schema.js';

export interface QueryToolError {
  error: 'invalid_arguments' | 'unknown_tool';
  detail: string;
}

interface QueryTool<TArgs> {
  definition: LlmToolDefinition;
  schema: ZodType<TArgs>;
  run(coupleId: string, args: TArgs): Promise<unknown>;
}

const toAmount = (value: string): number => Number(value);

const parseJson = (
  raw: string,
): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
};

@Injectable()
export class ReceiptQueryTools {
  private readonly tools: ReadonlyMap<string, QueryTool<unknown>>;

  constructor(private readonly queries: ReceiptQueryRepository) {
    this.tools = new Map<string, QueryTool<unknown>>([
      [QUERY_TOOL_NAMES.GET_MONTH_SUMMARY, this.monthSummaryTool()],
      [QUERY_TOOL_NAMES.GET_TOP_PRODUCTS, this.topProductsTool()],
      [QUERY_TOOL_NAMES.GET_CATEGORY_SPEND, this.categorySpendTool()],
      [QUERY_TOOL_NAMES.SEARCH_ITEMS, this.searchItemsTool()],
    ]);
  }

  definitions(): LlmToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.definition);
  }

  async execute(coupleId: string, call: LlmToolCall): Promise<unknown> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return this.error('unknown_tool', `Tool desconocida: ${call.name}`);
    }
    const parsedJson = parseJson(call.argumentsJson);
    if (!parsedJson.ok) {
      return this.error(
        'invalid_arguments',
        'Los argumentos no son JSON válido',
      );
    }
    const parsed = tool.schema.safeParse(parsedJson.value);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'args'}: ${issue.message}`)
        .join('; ');
      return this.error('invalid_arguments', detail);
    }
    return tool.run(coupleId, parsed.data);
  }

  private error(
    error: QueryToolError['error'],
    detail: string,
  ): QueryToolError {
    return { error, detail };
  }

  private monthSummaryTool(): QueryTool<unknown> {
    return this.asTool<MonthSummaryArgs>({
      definition: {
        name: QUERY_TOOL_NAMES.GET_MONTH_SUMMARY,
        description:
          'Total gastado en boletas de un mes, cantidad de boletas y desglose por categoría.',
        parametersJsonSchema: MONTH_SUMMARY_JSON_SCHEMA,
      },
      schema: monthSummaryArgsSchema,
      run: async (coupleId, args) => {
        const summary = await this.queries.summaryForMonth(
          coupleId,
          args.year,
          args.month,
        );
        return {
          total: toAmount(summary.total),
          receiptCount: summary.receiptCount,
          byCategory: summary.byCategory.map((row) => ({
            category: row.category,
            amount: toAmount(row.amount),
            itemCount: row.itemCount,
          })),
        };
      },
    });
  }

  private topProductsTool(): QueryTool<unknown> {
    return this.asTool<TopProductsArgs>({
      definition: {
        name: QUERY_TOOL_NAMES.GET_TOP_PRODUCTS,
        description:
          'Productos con mayor gasto en un mes, con monto total y cantidad de veces comprados.',
        parametersJsonSchema: TOP_PRODUCTS_JSON_SCHEMA,
      },
      schema: topProductsArgsSchema,
      run: async (coupleId, args) => {
        const rows = await this.queries.topProducts(
          coupleId,
          args.year,
          args.month,
          args.limit ?? RECEIPT_DEFAULTS.queryTopProductsLimit,
        );
        return {
          products: rows.map((row) => ({
            name: row.name,
            amount: toAmount(row.amount),
            itemCount: row.itemCount,
          })),
        };
      },
    });
  }

  private categorySpendTool(): QueryTool<unknown> {
    return this.asTool<CategorySpendArgs>({
      definition: {
        name: QUERY_TOOL_NAMES.GET_CATEGORY_SPEND,
        description:
          'Gasto en una categoría entre dos fechas (máximo 366 días), total y por mes.',
        parametersJsonSchema: CATEGORY_SPEND_JSON_SCHEMA,
      },
      schema: categorySpendArgsSchema,
      run: async (coupleId, args) => {
        const rows = await this.queries.categorySpend(
          coupleId,
          args.category,
          args.from,
          args.to,
        );
        const byMonth = rows.map((row) => ({
          month: row.month,
          amount: toAmount(row.amount),
          itemCount: row.itemCount,
        }));
        const total = byMonth.reduce((sum, row) => sum + row.amount, 0);
        return { category: args.category, total, byMonth };
      },
    });
  }

  private searchItemsTool(): QueryTool<unknown> {
    return this.asTool<SearchItemsArgs>({
      definition: {
        name: QUERY_TOOL_NAMES.SEARCH_ITEMS,
        description:
          'Busca ítems comprados en un mes cuya descripción o producto contenga un texto; devuelve fecha, comercio y monto.',
        parametersJsonSchema: SEARCH_ITEMS_JSON_SCHEMA,
      },
      schema: searchItemsArgsSchema,
      run: async (coupleId, args) => {
        const rows = await this.queries.searchItems(
          coupleId,
          args.text,
          args.year,
          args.month,
          RECEIPT_DEFAULTS.querySearchLimit,
        );
        return {
          items: rows.map((row) => ({
            description: row.productName ?? row.description,
            amount: toAmount(row.amount),
            date: row.receiptDate,
            merchant: row.merchantName,
          })),
        };
      },
    });
  }

  private asTool<TArgs>(tool: QueryTool<TArgs>): QueryTool<unknown> {
    return tool as unknown as QueryTool<unknown>;
  }
}
