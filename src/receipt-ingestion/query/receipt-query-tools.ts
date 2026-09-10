import { Injectable } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { LlmToolCall, LlmToolDefinition } from '../llm/llm.interfaces.js';
import {
  RECEIPT_DEFAULTS,
  RECEIPT_PRODUCT_CATEGORY_LABELS,
  type ReceiptProductCategory,
} from '../receipt.constants.js';
import { ReceiptQueryRepository } from '../repository/receipt-query.repository.js';
import {
  CATEGORY_SPEND_JSON_SCHEMA,
  categorySpendArgsSchema,
  LIST_CATEGORY_ITEMS_JSON_SCHEMA,
  listCategoryItemsArgsSchema,
  MONTH_SUMMARY_JSON_SCHEMA,
  monthSummaryArgsSchema,
  QUERY_TOOL_NAMES,
  SEARCH_ITEMS_JSON_SCHEMA,
  searchItemsArgsSchema,
  TOP_PRODUCTS_JSON_SCHEMA,
  topProductsArgsSchema,
  type CategorySpendArgs,
  type ListCategoryItemsArgs,
  type MonthSummaryArgs,
  type SearchItemsArgs,
  type TopProductsArgs,
  SEARCH_RECEIPTS_JSON_SCHEMA,
  searchReceiptsArgsSchema,
  RECEIPT_DETAIL_JSON_SCHEMA,
  receiptDetailArgsSchema,
  type SearchReceiptsArgs,
  type ReceiptDetailArgs,
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
const toNullableAmount = (value: string | null): number | null =>
  value === null ? null : toAmount(value);

const categoryLabel = (category: string): string =>
  RECEIPT_PRODUCT_CATEGORY_LABELS[category as ReceiptProductCategory] ??
  category;

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
      [QUERY_TOOL_NAMES.LIST_CATEGORY_ITEMS, this.listCategoryItemsTool()],
      [QUERY_TOOL_NAMES.SEARCH_ITEMS, this.searchItemsTool()],
      [QUERY_TOOL_NAMES.SEARCH_RECEIPTS, this.searchReceiptsTool()],
      [QUERY_TOOL_NAMES.GET_RECEIPT_DETAIL, this.receiptDetailTool()],
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
            label: categoryLabel(row.category),
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
        return {
          category: args.category,
          label: categoryLabel(args.category),
          total,
          byMonth,
        };
      },
    });
  }

  private listCategoryItemsTool(): QueryTool<unknown> {
    return this.asTool<ListCategoryItemsArgs>({
      definition: {
        name: QUERY_TOOL_NAMES.LIST_CATEGORY_ITEMS,
        description:
          'Lista los productos comprados en una categoría durante un mes, con monto, fecha y comercio. Úsala cuando pidan el detalle o el desglose de una categoría.',
        parametersJsonSchema: LIST_CATEGORY_ITEMS_JSON_SCHEMA,
      },
      schema: listCategoryItemsArgsSchema,
      run: async (coupleId, args) => {
        const rows = await this.queries.listCategoryItems(
          coupleId,
          args.category,
          args.year,
          args.month,
          args.limit ?? RECEIPT_DEFAULTS.queryCategoryItemsLimit,
        );
        return {
          category: args.category,
          label: categoryLabel(args.category),
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

  private searchReceiptsTool(): QueryTool<unknown> {
    return this.asTool<SearchReceiptsArgs>({
      definition: {
        name: QUERY_TOOL_NAMES.SEARCH_RECEIPTS,
        description:
          'Busca boletas por comercio (nombre original, canónico o alias), sin distinguir mayúsculas ni tildes. Devuelve ID, fecha, total, cantidad de ítems y estado. Úsala para “boleta LIDER” o “detalle de la compra del Lider”. Incluye pendientes de revisión.',
        parametersJsonSchema: SEARCH_RECEIPTS_JSON_SCHEMA,
      },
      schema: searchReceiptsArgsSchema,
      run: async (coupleId, args) => {
        const limit = RECEIPT_DEFAULTS.queryReceiptSearchLimit;
        const offset = args.offset ?? 0;
        const rows = await this.queries.searchReceipts(
          coupleId,
          args.text,
          args.year,
          args.month,
          limit + 1,
          offset,
        );
        return {
          receipts: rows
            .slice(0, limit)
            .map((row) => ({ ...row, total: toNullableAmount(row.total) })),
          hasMore: rows.length > limit,
          nextOffset: rows.length > limit ? offset + limit : null,
        };
      },
    });
  }

  private receiptDetailTool(): QueryTool<unknown> {
    return this.asTool<ReceiptDetailArgs>({
      definition: {
        name: QUERY_TOOL_NAMES.GET_RECEIPT_DETAIL,
        description:
          'Obtiene el detalle completo de una boleta encontrada por search_receipts: todos sus ítems en orden, cantidades, precios y montos. No aplica el límite de 20 productos de search_items.',
        parametersJsonSchema: RECEIPT_DETAIL_JSON_SCHEMA,
      },
      schema: receiptDetailArgsSchema,
      run: async (coupleId, args) => {
        const row = await this.queries.receiptDetail(coupleId, args.receiptId);
        if (!row) return { receipt: null };
        return {
          receipt: {
            ...row,
            total: toNullableAmount(row.total),
            items: row.items.map((item) => ({
              ...item,
              quantity: toNullableAmount(item.quantity),
              unitPrice: toNullableAmount(item.unitPrice),
              amount: toAmount(item.amount),
            })),
          },
        };
      },
    });
  }

  private asTool<TArgs>(tool: QueryTool<TArgs>): QueryTool<unknown> {
    return tool as unknown as QueryTool<unknown>;
  }
}
