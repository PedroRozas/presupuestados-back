export const RECEIPT_QUEUE_NAME = 'receipts';

export const RECEIPT_JOB = {
  INGEST_IMAGE: 'ingest-image',
  CLOSE_GROUP: 'close-group',
  NOTIFY_USER: 'notify-user',
  EXTRACT_GROUP: 'extract-group',
  NORMALIZE_GROUP: 'normalize-group',
  SWEEP_STALE_GROUPS: 'sweep-stale-groups',
} as const;

export type ReceiptJobName = (typeof RECEIPT_JOB)[keyof typeof RECEIPT_JOB];

export const RECEIPT_PRODUCT_CATEGORIES = [
  'frutas_verduras',
  'carnes_pescados',
  'lacteos_huevos',
  'panaderia',
  'abarrotes',
  'congelados',
  'bebidas',
  'alcohol',
  'snacks_dulces',
  'limpieza_hogar',
  'higiene_personal',
  'bebe',
  'mascotas',
  'farmacia',
  'otros',
] as const;

export type ReceiptProductCategory =
  (typeof RECEIPT_PRODUCT_CATEGORIES)[number];

export const RECEIPT_GROUP_STATUSES = [
  'collecting',
  'extracting',
  'needs_review',
  'ready',
  'discarded',
  'failed',
] as const;

export type ReceiptGroupStatus = (typeof RECEIPT_GROUP_STATUSES)[number];

export const RECEIPT_SOURCE_KINDS = [
  'printed',
  'handwritten',
  'unknown',
] as const;

export type ReceiptSourceKind = (typeof RECEIPT_SOURCE_KINDS)[number];

export const RECEIPT_DEFAULTS = {
  workerEnabled: true,
  mediaSource: 'meta',
  localMediaDir: './tmp/receipt-media',
  graphApiVersion: 'v21.0',
  storageBucket: 'receipts',
  signedUrlTtlSeconds: 300,
  groupWindowSeconds: 90,
  webpQuality: 90,
  minWebpQuality: 90,
  maxWidthPx: 2000,
  rateLimitWindowSeconds: 60,
  rateLimitMax: 20,
  workerConcurrency: 1,
  retryAttempts: 3,
  retryBackoffMs: 5000,
  extractionMaxOutputTokens: 8000,
  extractionTimeoutMs: 90000,
  minConfidence: 0.85,
  totalToleranceClp: 50,
  monthlyExtractionCap: 300,
  matchHigh: 0.6,
  matchLow: 0.3,
  candidateLimit: 5,
  normalizationMaxOutputTokens: 600,
  sweepIntervalMinutes: 10,
  staleExtractingMinutes: 30,
} as const;

export const RECEIPT_IMAGE_CONTENT_TYPE = 'image/webp';
export const RECEIPT_IMAGE_EXTENSION = 'webp';
export const RECEIPT_CURRENCY_DEFAULT = 'CLP';
export const RECEIPT_CLOSE_COMMAND = 'listo';
export const RECEIPT_RATE_LIMIT_KEY_PREFIX = 'rl:receipts:sender';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const RETENTION_DAYS = 7;

export const RECEIPT_FAILED_JOB_RETENTION_SECONDS =
  RETENTION_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

export const RECEIPT_CLOSE_JOB_ID_PREFIX = 'close';
export const RECEIPT_CLOSE_COMMAND_JOB_SUFFIX = 'command';
export const RECEIPT_CLOSE_RESCHEDULE_JOB_SUFFIX = 'r';
export const RECEIPT_MESSAGING_SOURCE_DEFAULT = 'meta';

export const RECEIPT_REVIEW_REASONS = {
  TOTAL_MISMATCH: 'total_mismatch',
  LOW_CONFIDENCE: 'low_confidence',
  HANDWRITTEN: 'handwritten',
  MISSING_DATE: 'missing_date',
  EXTRACTION_FAILED: 'extraction_failed',
  MONTHLY_CAP: 'monthly_cap',
} as const;

export type ReceiptReviewReason =
  (typeof RECEIPT_REVIEW_REASONS)[keyof typeof RECEIPT_REVIEW_REASONS];

export const RECEIPT_EXTRACTION_STATUS = {
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export const RECEIPT_PROMPT_VERSION_V1 = 'v1';

export const RECEIPT_PERIOD_TIME_ZONE = 'America/Santiago';

export const RECEIPT_NORMALIZATION_PROMPT_VERSION_V1 = 'norm-v1';
