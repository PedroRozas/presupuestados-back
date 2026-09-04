export const RECEIPT_QUEUE_NAME = 'receipts';

export const RECEIPT_JOB = {
  INGEST_IMAGE: 'ingest-image',
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
} as const;

export const RECEIPT_IMAGE_CONTENT_TYPE = 'image/webp';
export const RECEIPT_IMAGE_EXTENSION = 'webp';
export const RECEIPT_CURRENCY_DEFAULT = 'CLP';
export const RECEIPT_CLOSE_COMMAND = 'listo';
export const RECEIPT_RATE_LIMIT_KEY_PREFIX = 'rl:receipts:sender';
