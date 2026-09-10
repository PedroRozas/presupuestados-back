export const RECEIPT_QUEUE_NAME = 'receipts';

export const RECEIPT_JOB = {
  INGEST_IMAGE: 'ingest-image',
  CLOSE_GROUP: 'close-group',
  NOTIFY_USER: 'notify-user',
  EXTRACT_GROUP: 'extract-group',
  NORMALIZE_GROUP: 'normalize-group',
  SWEEP_STALE_GROUPS: 'sweep-stale-groups',
  ANSWER_QUERY: 'answer-query',
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

export const RECEIPT_PRODUCT_CATEGORY_LABELS: Record<
  ReceiptProductCategory,
  string
> = {
  frutas_verduras: 'Frutas y verduras',
  carnes_pescados: 'Carnes y pescados',
  lacteos_huevos: 'Lácteos y huevos',
  panaderia: 'Panadería',
  abarrotes: 'Abarrotes',
  congelados: 'Congelados',
  bebidas: 'Bebidas',
  alcohol: 'Alcohol',
  snacks_dulces: 'Snacks y dulces',
  limpieza_hogar: 'Limpieza y hogar',
  higiene_personal: 'Higiene personal',
  bebe: 'Bebé',
  mascotas: 'Mascotas',
  farmacia: 'Farmacia',
  otros: 'Otros',
};

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
  normalizationMaxOutputTokens: 2000,
  normalizationTimeoutMs: 30000,
  normalizationReasoningEffort: 'minimal',
  extractionTemperature: 0,
  sweepIntervalMinutes: 10,
  telegramApiBaseUrl: 'https://api.telegram.org',
  staleExtractingMinutes: 30,
  queryMaxOutputTokens: 4000,
  queryMaxToolRounds: 3,
  queryRateLimitWindowSeconds: 60,
  queryRateLimitMax: 10,
  queryMaxMessageChars: 500,
  queryHistoryMaxTurns: 8,
  queryHistoryTtlSeconds: 1800,
  queryHistoryMaxTurnChars: 700,
  queryTopProductsLimit: 10,
  querySearchLimit: 20,
  queryReceiptSearchLimit: 10,
  queryCategoryItemsLimit: 20,
  queryTimeoutMs: 30000,
  queryTemperature: 0,
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
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
export const TELEGRAM_TEXT_MAX_CHARS = 4096;

export const RECEIPT_REVIEW_REASONS = {
  TOTAL_MISMATCH: 'total_mismatch',
  LOW_CONFIDENCE: 'low_confidence',
  HANDWRITTEN: 'handwritten',
  MISSING_DATE: 'missing_date',
  EXTRACTION_FAILED: 'extraction_failed',
  MONTHLY_CAP: 'monthly_cap',
  UNASSIGNED_DISCOUNT: 'unassigned_discount',
} as const;

export type ReceiptReviewReason =
  (typeof RECEIPT_REVIEW_REASONS)[keyof typeof RECEIPT_REVIEW_REASONS];

export const RECEIPT_EXTRACTION_STATUS = {
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
} as const;

export const RECEIPT_PROMPT_VERSION_V1 = 'v1';
export const RECEIPT_PROMPT_VERSION_V2 = 'v2';
export const RECEIPT_PROMPT_VERSION_V3 = 'v3';

export const RECEIPT_PERIOD_TIME_ZONE = 'America/Santiago';

export const RECEIPT_NORMALIZATION_PROMPT_PREFIX = 'norm-';
export const RECEIPT_NORMALIZATION_PROMPT_VERSION_V1 = `${RECEIPT_NORMALIZATION_PROMPT_PREFIX}v1`;

export const RECEIPT_QUERY_PROMPT_VERSION_V1 = 'query-v1';
export const RECEIPT_QUERY_RATE_LIMIT_KEY_PREFIX = 'rl:receipts:query';
export const RECEIPT_QUERY_HISTORY_KEY_PREFIX = 'receipts:query:history';

export const MERCHANT_DECISION_KEY = 'merchant';

export const NORMALIZATION_BASE_OUTPUT_TOKENS = 200;
export const NORMALIZATION_TOKENS_PER_QUESTION = 60;
