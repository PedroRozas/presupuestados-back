CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"limit" numeric NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"couple_id" uuid,
	"associated_card" text,
	"default_split_method" text DEFAULT '50/50'
);
--> statement-breakpoint
CREATE TABLE "couples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "couples_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"description" text,
	"date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"couple_id" uuid
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"is_recurring" boolean DEFAULT false,
	"recurrence_interval" text,
	"split_method" text NOT NULL,
	"paid_by" uuid NOT NULL,
	"assigned_user_id" uuid,
	"budget_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"couple_id" uuid,
	"recurrence_end_date" timestamp with time zone,
	"batch_id" uuid,
	"batch_name" text,
	"is_credit" boolean DEFAULT false,
	"category_id" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"couple_id" uuid,
	"linked_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "incomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"description" text,
	"date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"couple_id" uuid
);
--> statement-breakpoint
CREATE TABLE "partner_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"receiver_email" text NOT NULL,
	"receiver_id" uuid,
	"status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "premium_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now(),
	"old_value" boolean,
	"new_value" boolean,
	"changed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"couple_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"phone" text,
	"has_seen_onboarding" boolean DEFAULT false,
	"is_premium" boolean DEFAULT false,
	"default_split_method" text DEFAULT '50/50'
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_family_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deductions" ADD CONSTRAINT "deductions_user_id_family_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deductions" ADD CONSTRAINT "deductions_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_family_members_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_assigned_user_id_family_members_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_family_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_audit_log" ADD CONSTRAINT "premium_audit_log_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_audit_log" ADD CONSTRAINT "premium_audit_log_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deductions_couple" ON "deductions" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_couple_date" ON "expenses" USING btree ("couple_id","date");--> statement-breakpoint
CREATE INDEX "idx_expenses_couple_recurring" ON "expenses" USING btree ("couple_id","is_recurring","date");--> statement-breakpoint
CREATE INDEX "idx_expenses_couple_budget" ON "expenses" USING btree ("couple_id","budget_id");--> statement-breakpoint
CREATE INDEX "idx_family_members_couple" ON "family_members" USING btree ("couple_id");--> statement-breakpoint
CREATE INDEX "idx_family_members_linked_user" ON "family_members" USING btree ("linked_user_id");--> statement-breakpoint
CREATE INDEX "idx_incomes_couple" ON "incomes" USING btree ("couple_id");