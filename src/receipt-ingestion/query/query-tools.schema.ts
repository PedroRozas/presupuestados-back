import { z } from 'zod';
import {
  RECEIPT_DEFAULTS,
  RECEIPT_PRODUCT_CATEGORIES,
} from '../receipt.constants.js';

export const QUERY_TOOL_NAMES = {
  GET_MONTH_SUMMARY: 'get_month_summary',
  GET_TOP_PRODUCTS: 'get_top_products',
  GET_CATEGORY_SPEND: 'get_category_spend',
  LIST_CATEGORY_ITEMS: 'list_category_items',
  SEARCH_ITEMS: 'search_items',
} as const;

export type QueryToolName =
  (typeof QUERY_TOOL_NAMES)[keyof typeof QUERY_TOOL_NAMES];

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;
const MIN_MONTH = 1;
const MAX_MONTH = 12;
const MIN_SEARCH_CHARS = 2;
const MAX_SEARCH_CHARS = 80;
const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isRealIsoDate = (value: string): boolean => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const daysBetween = (from: string, to: string): number =>
  (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;

const yearSchema = z.number().int().min(MIN_YEAR).max(MAX_YEAR);
const monthSchema = z.number().int().min(MIN_MONTH).max(MAX_MONTH);
const isoDateSchema = z
  .string()
  .refine(isRealIsoDate, 'Fecha inválida, usar YYYY-MM-DD');

export const monthSummaryArgsSchema = z.object({
  year: yearSchema,
  month: monthSchema,
});

export const topProductsArgsSchema = z.object({
  year: yearSchema,
  month: monthSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(RECEIPT_DEFAULTS.queryTopProductsLimit)
    .nullable(),
});

export const categorySpendArgsSchema = z
  .object({
    category: z.enum(RECEIPT_PRODUCT_CATEGORIES),
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .refine((args) => args.from <= args.to, 'from debe ser <= to')
  .refine(
    (args) => daysBetween(args.from, args.to) <= MAX_RANGE_DAYS,
    `El rango no puede superar ${MAX_RANGE_DAYS} días`,
  );

export const listCategoryItemsArgsSchema = z.object({
  category: z.enum(RECEIPT_PRODUCT_CATEGORIES),
  year: yearSchema,
  month: monthSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(RECEIPT_DEFAULTS.queryCategoryItemsLimit)
    .nullable(),
});

export const searchItemsArgsSchema = z.object({
  text: z.string().trim().min(MIN_SEARCH_CHARS).max(MAX_SEARCH_CHARS),
  year: yearSchema,
  month: monthSchema,
});

export type MonthSummaryArgs = z.infer<typeof monthSummaryArgsSchema>;
export type TopProductsArgs = z.infer<typeof topProductsArgsSchema>;
export type CategorySpendArgs = z.infer<typeof categorySpendArgsSchema>;
export type ListCategoryItemsArgs = z.infer<typeof listCategoryItemsArgsSchema>;
export type SearchItemsArgs = z.infer<typeof searchItemsArgsSchema>;

const yearJsonSchema = {
  type: 'integer',
  minimum: MIN_YEAR,
  maximum: MAX_YEAR,
  description: 'Año calendario, ej. 2026',
};
const monthJsonSchema = {
  type: 'integer',
  minimum: MIN_MONTH,
  maximum: MAX_MONTH,
  description: 'Mes 1-12',
};
const isoDateJsonSchema = {
  type: 'string',
  description: 'Fecha en formato YYYY-MM-DD',
};

export const MONTH_SUMMARY_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: { year: yearJsonSchema, month: monthJsonSchema },
  required: ['year', 'month'],
};

export const TOP_PRODUCTS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    year: yearJsonSchema,
    month: monthJsonSchema,
    limit: {
      type: ['integer', 'null'],
      description: `Cantidad de productos, máximo ${RECEIPT_DEFAULTS.queryTopProductsLimit}; null usa el máximo`,
    },
  },
  required: ['year', 'month', 'limit'],
};

export const CATEGORY_SPEND_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: [...RECEIPT_PRODUCT_CATEGORIES],
      description: 'Categoría de la taxonomía',
    },
    from: isoDateJsonSchema,
    to: isoDateJsonSchema,
  },
  required: ['category', 'from', 'to'],
};

export const LIST_CATEGORY_ITEMS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: {
      type: 'string',
      enum: [...RECEIPT_PRODUCT_CATEGORIES],
      description: 'Categoría de la taxonomía',
    },
    year: yearJsonSchema,
    month: monthJsonSchema,
    limit: {
      type: ['integer', 'null'],
      description: `Cantidad de ítems, máximo ${RECEIPT_DEFAULTS.queryCategoryItemsLimit}; null usa el máximo`,
    },
  },
  required: ['category', 'year', 'month', 'limit'],
};

export const SEARCH_ITEMS_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: {
      type: 'string',
      description: `Texto a buscar en la descripción del producto (${MIN_SEARCH_CHARS}-${MAX_SEARCH_CHARS} caracteres)`,
    },
    year: yearJsonSchema,
    month: monthJsonSchema,
  },
  required: ['text', 'year', 'month'],
};
