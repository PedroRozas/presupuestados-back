import { z } from 'zod';
import {
  RECEIPT_PRODUCT_CATEGORIES,
  RECEIPT_SOURCE_KINDS,
} from '../receipt.constants.js';

const FALLBACK_CATEGORY = 'otros';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;

const isRealCalendarDate = (value: string): boolean => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 1) - 1 &&
    date.getUTCDate() === day
  );
};

const confidenceSchema = z.number().min(MIN_CONFIDENCE).max(MAX_CONFIDENCE);

const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN)
  .refine(isRealCalendarDate, { message: 'fecha inexistente' });

const itemSchema = z.object({
  description_raw: z.string().min(1),
  qty: z.number().nullable(),
  unit_price: z.number().nullable(),
  amount: z.number(),
  category: z.enum(RECEIPT_PRODUCT_CATEGORIES).catch(FALLBACK_CATEGORY),
  confidence: confidenceSchema,
});

export const extractionOutputSchema = z.object({
  merchant_raw: z.string().nullable(),
  merchant_rut: z.string().nullable(),
  receipt_date: isoDateSchema.nullable(),
  total: z.number().nullable(),
  currency: z.string().min(1),
  source_kind: z.enum(RECEIPT_SOURCE_KINDS),
  items: z.array(itemSchema),
  confidence: confidenceSchema,
  warnings: z.array(z.string()),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
export type ExtractionItem = ExtractionOutput['items'][number];

export class ExtractionOutputInvalidError extends Error {
  constructor(detail: string) {
    super(`extraction_output_invalid: ${detail}`);
    this.name = 'ExtractionOutputInvalidError';
  }
}

const parseJson = (rawText: string): unknown => {
  try {
    return JSON.parse(rawText) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExtractionOutputInvalidError(`json: ${reason}`);
  }
};

export const parseExtractionOutput = (rawText: string): ExtractionOutput => {
  const result = extractionOutputSchema.safeParse(parseJson(rawText));
  if (!result.success) {
    throw new ExtractionOutputInvalidError(result.error.message);
  }
  return result.data;
};
