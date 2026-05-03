import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  boolean,
  integer,
  index,
  pgEnum,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── couples ────────────────────────────────────────────────────────────────

export const couples = pgTable('couples', {
  id: uuid('id').primaryKey().defaultRandom(),
  inviteCode: text('invite_code').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Couple = typeof couples.$inferSelect;
export type NewCouple = typeof couples.$inferInsert;

// ─── profiles ───────────────────────────────────────────────────────────────

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(), // viene de auth.users, sin default
  email: text('email'),
  coupleId: uuid('couple_id').references(() => couples.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  hasSeenOnboarding: boolean('has_seen_onboarding').default(false),
  isPremium: boolean('is_premium').default(false),
  defaultSplitMethod: text('default_split_method').default('50/50'),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;

// ─── family_members ──────────────────────────────────────────────────────────

export const familyMembers = pgTable(
  'family_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    coupleId: uuid('couple_id').references(() => couples.id),
    linkedUserId: uuid('linked_user_id'),
  },
  (t) => [
    index('idx_family_members_couple').on(t.coupleId),
    index('idx_family_members_linked_user').on(t.linkedUserId),
  ],
);

export type FamilyMember = typeof familyMembers.$inferSelect;
export type NewFamilyMember = typeof familyMembers.$inferInsert;

// ─── budgets ─────────────────────────────────────────────────────────────────

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  limit: numeric('limit').notNull(),
  userId: uuid('user_id').references(() => familyMembers.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  coupleId: uuid('couple_id').references(() => couples.id),
  associatedCard: text('associated_card'),
  defaultSplitMethod: text('default_split_method').default('50/50'),
});

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

// ─── expense_categories ──────────────────────────────────────────────────────

export const expenseCategories = pgTable('expense_categories', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;

// ─── expenses ────────────────────────────────────────────────────────────────

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull(),
    amount: numeric('amount').notNull(),
    date: timestamp('date', { withTimezone: true }).notNull(),
    description: text('description').notNull(),
    isRecurring: boolean('is_recurring').default(false),
    recurrenceInterval: text('recurrence_interval'),
    splitMethod: text('split_method').notNull(),
    paidBy: uuid('paid_by')
      .notNull()
      .references(() => familyMembers.id),
    assignedUserId: uuid('assigned_user_id').references(() => familyMembers.id),
    budgetId: uuid('budget_id').references(() => budgets.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    coupleId: uuid('couple_id').references(() => couples.id),
    recurrenceEndDate: timestamp('recurrence_end_date', { withTimezone: true }),
    batchId: uuid('batch_id'),
    batchName: text('batch_name'),
    isCredit: boolean('is_credit').default(false),
    categoryId: integer('category_id').default(0),
  },
  (t) => [
    // Cubre la mayoría de queries: filtros por pareja + fecha
    index('idx_expenses_couple_date').on(t.coupleId, t.date),
    // Cubre queries de recurrentes: couple + is_recurring + date
    index('idx_expenses_couple_recurring').on(
      t.coupleId,
      t.isRecurring,
      t.date,
    ),
    // Cubre queries de budget summary
    index('idx_expenses_couple_budget').on(t.coupleId, t.budgetId),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

// ─── incomes ─────────────────────────────────────────────────────────────────

export const incomes = pgTable(
  'incomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => familyMembers.id),
    amount: numeric('amount').notNull(),
    description: text('description'),
    date: timestamp('date', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    coupleId: uuid('couple_id').references(() => couples.id),
  },
  (t) => [index('idx_incomes_couple').on(t.coupleId)],
);

export type Income = typeof incomes.$inferSelect;
export type NewIncome = typeof incomes.$inferInsert;

// ─── deductions ──────────────────────────────────────────────────────────────

export const deductions = pgTable(
  'deductions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => familyMembers.id),
    amount: numeric('amount').notNull(),
    description: text('description'),
    date: timestamp('date', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    coupleId: uuid('couple_id').references(() => couples.id),
  },
  (t) => [index('idx_deductions_couple').on(t.coupleId)],
);

export type Deduction = typeof deductions.$inferSelect;
export type NewDeduction = typeof deductions.$inferInsert;

// ─── partner_requests ────────────────────────────────────────────────────────

export const partnerRequests = pgTable('partner_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  senderId: uuid('sender_id').notNull(),
  receiverEmail: text('receiver_email').notNull(),
  receiverId: uuid('receiver_id'),
  status: text('status').default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export type PartnerRequest = typeof partnerRequests.$inferSelect;
export type NewPartnerRequest = typeof partnerRequests.$inferInsert;

// ─── premium_audit_log ───────────────────────────────────────────────────────

export const premiumAuditLog = pgTable('premium_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
  oldValue: boolean('old_value'),
  newValue: boolean('new_value'),
  changedBy: uuid('changed_by').references(() => profiles.id),
});

export type PremiumAuditLog = typeof premiumAuditLog.$inferSelect;
export type NewPremiumAuditLog = typeof premiumAuditLog.$inferInsert;

// ─── ai_usage_monthly ───────────────────────────────────────────────────────

export const aiUsageFeature = pgEnum('ai_usage_feature', [
  'statement_scan',
  'chatbot_response',
]);

export const aiUsageMonthly = pgTable(
  'ai_usage_monthly',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    feature: aiUsageFeature('feature').notNull(),
    periodMonth: date('period_month').notNull(),
    usageCount: integer('usage_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('idx_ai_usage_monthly_unique_user_feature_period').on(
      t.userId,
      t.feature,
      t.periodMonth,
    ),
    index('idx_ai_usage_monthly_user_period').on(t.userId, t.periodMonth),
  ],
);

export type AIUsageMonthly = typeof aiUsageMonthly.$inferSelect;
export type NewAIUsageMonthly = typeof aiUsageMonthly.$inferInsert;
