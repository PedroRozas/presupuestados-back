import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { couples, profiles } from './index.js';
import {
  RECEIPT_GROUP_STATUSES,
  RECEIPT_PRODUCT_CATEGORIES,
  RECEIPT_SOURCE_KINDS,
} from '../../receipt-ingestion/receipt.constants.js';

export const receiptProductCategory = pgEnum(
  'receipt_product_category',
  RECEIPT_PRODUCT_CATEGORIES,
);
export const receiptGroupStatus = pgEnum(
  'receipt_group_status',
  RECEIPT_GROUP_STATUSES,
);
export const receiptSourceKind = pgEnum(
  'receipt_source_kind',
  RECEIPT_SOURCE_KINDS,
);

export const receiptAllowedSenders = pgTable('receipt_allowed_senders', {
  id: uuid('id').primaryKey().defaultRandom(),
  phoneE164: text('phone_e164').notNull().unique(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  coupleId: uuid('couple_id')
    .notNull()
    .references(() => couples.id),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ReceiptAllowedSender = typeof receiptAllowedSenders.$inferSelect;
export type NewReceiptAllowedSender = typeof receiptAllowedSenders.$inferInsert;

export const receiptMerchants = pgTable(
  'receipt_merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coupleId: uuid('couple_id')
      .notNull()
      .references(() => couples.id),
    canonicalName: text('canonical_name').notNull(),
    rut: text('rut'),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_receipt_merchants_couple_name').on(
      t.coupleId,
      t.canonicalName,
    ),
    index('idx_receipt_merchants_name_trgm').using(
      'gin',
      sql`${t.canonicalName} gin_trgm_ops`,
    ),
  ],
);

export type ReceiptMerchant = typeof receiptMerchants.$inferSelect;
export type NewReceiptMerchant = typeof receiptMerchants.$inferInsert;

export const receiptGroups = pgTable(
  'receipt_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coupleId: uuid('couple_id')
      .notNull()
      .references(() => couples.id),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => profiles.id),
    senderPhoneE164: text('sender_phone_e164').notNull(),
    status: receiptGroupStatus('status').notNull().default('collecting'),
    receiptDate: date('receipt_date'),
    merchantId: uuid('merchant_id').references(() => receiptMerchants.id),
    merchantRaw: text('merchant_raw'),
    merchantRut: text('merchant_rut'),
    totalDeclared: numeric('total_declared'),
    currency: text('currency').notNull().default('CLP'),
    sourceKind: receiptSourceKind('source_kind').notNull().default('unknown'),
    reviewReasons: text('review_reasons')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastImageAt: timestamp('last_image_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_receipt_groups_couple_date').on(t.coupleId, t.receiptDate),
    index('idx_receipt_groups_sender_status').on(t.senderPhoneE164, t.status),
    uniqueIndex('idx_receipt_groups_one_collecting_per_sender')
      .on(t.coupleId, t.senderPhoneE164)
      .where(sql`${t.status} = 'collecting'`),
  ],
);

export type ReceiptGroup = typeof receiptGroups.$inferSelect;
export type NewReceiptGroup = typeof receiptGroups.$inferInsert;

export const receiptImages = pgTable(
  'receipt_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => receiptGroups.id, { onDelete: 'cascade' }),
    coupleId: uuid('couple_id')
      .notNull()
      .references(() => couples.id),
    waMessageId: text('wa_message_id').notNull().unique(),
    senderPhoneE164: text('sender_phone_e164').notNull(),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => profiles.id),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    storageBucket: text('storage_bucket').notNull(),
    storagePath: text('storage_path').notNull(),
    sha256: text('sha256').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    pageIndex: integer('page_index').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_receipt_images_couple_sha').on(t.coupleId, t.sha256),
    uniqueIndex('idx_receipt_images_group_page').on(t.groupId, t.pageIndex),
  ],
);

export type ReceiptImage = typeof receiptImages.$inferSelect;
export type NewReceiptImage = typeof receiptImages.$inferInsert;

export const receiptExtractions = pgTable(
  'receipt_extractions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => receiptGroups.id, { onDelete: 'cascade' }),
    coupleId: uuid('couple_id')
      .notNull()
      .references(() => couples.id),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    rawJson: jsonb('raw_json'),
    confidence: numeric('confidence'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    attempt: integer('attempt').notNull().default(1),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_receipt_extractions_group').on(t.groupId)],
);

export type ReceiptExtraction = typeof receiptExtractions.$inferSelect;
export type NewReceiptExtraction = typeof receiptExtractions.$inferInsert;

export const receiptProducts = pgTable(
  'receipt_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    coupleId: uuid('couple_id')
      .notNull()
      .references(() => couples.id),
    canonicalName: text('canonical_name').notNull(),
    defaultCategory: receiptProductCategory('default_category').notNull(),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_receipt_products_couple_name').on(
      t.coupleId,
      t.canonicalName,
    ),
    index('idx_receipt_products_name_trgm').using(
      'gin',
      sql`${t.canonicalName} gin_trgm_ops`,
    ),
  ],
);

export type ReceiptProduct = typeof receiptProducts.$inferSelect;
export type NewReceiptProduct = typeof receiptProducts.$inferInsert;

export const receiptItems = pgTable(
  'receipt_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => receiptGroups.id, { onDelete: 'cascade' }),
    coupleId: uuid('couple_id')
      .notNull()
      .references(() => couples.id),
    descriptionRaw: text('description_raw').notNull(),
    productId: uuid('product_id').references(() => receiptProducts.id),
    category: receiptProductCategory('category').notNull(),
    qty: numeric('qty'),
    unitPrice: numeric('unit_price'),
    amount: numeric('amount').notNull(),
    confidence: numeric('confidence'),
    sourceImageId: uuid('source_image_id').references(() => receiptImages.id),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('idx_receipt_items_couple_category').on(t.coupleId, t.category),
    index('idx_receipt_items_group').on(t.groupId),
  ],
);

export type ReceiptItem = typeof receiptItems.$inferSelect;
export type NewReceiptItem = typeof receiptItems.$inferInsert;

export const receiptExtractionUsage = pgTable(
  'receipt_extraction_usage',
  {
    coupleId: uuid('couple_id')
      .notNull()
      .references(() => couples.id),
    periodMonth: date('period_month').notNull(),
    usageCount: integer('usage_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.coupleId, t.periodMonth] })],
);

export type ReceiptExtractionUsage = typeof receiptExtractionUsage.$inferSelect;
export type NewReceiptExtractionUsage =
  typeof receiptExtractionUsage.$inferInsert;
