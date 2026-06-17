CREATE TABLE "monthly_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"description" text,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"couple_id" uuid
);
--> statement-breakpoint
CREATE TABLE "monthly_incomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"description" text,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"couple_id" uuid
);
--> statement-breakpoint
ALTER TABLE "monthly_deductions" ADD CONSTRAINT "monthly_deductions_user_id_family_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_deductions" ADD CONSTRAINT "monthly_deductions_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_incomes" ADD CONSTRAINT "monthly_incomes_user_id_family_members_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."family_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_incomes" ADD CONSTRAINT "monthly_incomes_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_monthly_deductions_period" ON "monthly_deductions" USING btree ("couple_id","year","month","user_id");--> statement-breakpoint
CREATE INDEX "idx_monthly_incomes_period" ON "monthly_incomes" USING btree ("couple_id","year","month","user_id");