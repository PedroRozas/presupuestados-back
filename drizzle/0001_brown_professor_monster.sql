CREATE TYPE "public"."ai_usage_feature" AS ENUM('statement_scan', 'chatbot_response');--> statement-breakpoint
CREATE TABLE "ai_usage_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" "ai_usage_feature" NOT NULL,
	"period_month" date NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_monthly" ADD CONSTRAINT "ai_usage_monthly_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ai_usage_monthly_unique_user_feature_period" ON "ai_usage_monthly" USING btree ("user_id","feature","period_month");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_monthly_user_period" ON "ai_usage_monthly" USING btree ("user_id","period_month");