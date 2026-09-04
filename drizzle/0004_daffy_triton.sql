CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."receipt_group_status" AS ENUM('collecting', 'extracting', 'needs_review', 'ready', 'discarded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."receipt_product_category" AS ENUM('frutas_verduras', 'carnes_pescados', 'lacteos_huevos', 'panaderia', 'abarrotes', 'congelados', 'bebidas', 'alcohol', 'snacks_dulces', 'limpieza_hogar', 'higiene_personal', 'bebe', 'mascotas', 'farmacia', 'otros');--> statement-breakpoint
CREATE TYPE "public"."receipt_source_kind" AS ENUM('printed', 'handwritten', 'unknown');--> statement-breakpoint
CREATE TABLE "receipt_allowed_senders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"user_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_allowed_senders_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "receipt_extraction_usage" (
	"couple_id" uuid NOT NULL,
	"period_month" date NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_extraction_usage_couple_id_period_month_pk" PRIMARY KEY("couple_id","period_month")
);
--> statement-breakpoint
CREATE TABLE "receipt_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"raw_json" jsonb,
	"confidence" numeric,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"sender_phone_e164" text NOT NULL,
	"status" "receipt_group_status" DEFAULT 'collecting' NOT NULL,
	"receipt_date" date,
	"merchant_id" uuid,
	"merchant_raw" text,
	"total_declared" numeric,
	"currency" text DEFAULT 'CLP' NOT NULL,
	"source_kind" "receipt_source_kind" DEFAULT 'unknown' NOT NULL,
	"review_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_image_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "receipt_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"wa_message_id" text NOT NULL,
	"sender_phone_e164" text NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"page_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_images_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"couple_id" uuid NOT NULL,
	"description_raw" text NOT NULL,
	"product_id" uuid,
	"category" "receipt_product_category" NOT NULL,
	"qty" numeric,
	"unit_price" numeric,
	"amount" numeric NOT NULL,
	"confidence" numeric,
	"source_image_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"canonical_name" text NOT NULL,
	"rut" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"couple_id" uuid NOT NULL,
	"canonical_name" text NOT NULL,
	"default_category" "receipt_product_category" NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_allowed_senders" ADD CONSTRAINT "receipt_allowed_senders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_allowed_senders" ADD CONSTRAINT "receipt_allowed_senders_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_extraction_usage" ADD CONSTRAINT "receipt_extraction_usage_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_group_id_receipt_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."receipt_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_groups" ADD CONSTRAINT "receipt_groups_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_groups" ADD CONSTRAINT "receipt_groups_created_by_user_id_profiles_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_groups" ADD CONSTRAINT "receipt_groups_merchant_id_receipt_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."receipt_merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_images" ADD CONSTRAINT "receipt_images_group_id_receipt_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."receipt_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_images" ADD CONSTRAINT "receipt_images_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_images" ADD CONSTRAINT "receipt_images_sender_user_id_profiles_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_group_id_receipt_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."receipt_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_product_id_receipt_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."receipt_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_source_image_id_receipt_images_id_fk" FOREIGN KEY ("source_image_id") REFERENCES "public"."receipt_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_merchants" ADD CONSTRAINT "receipt_merchants_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_products" ADD CONSTRAINT "receipt_products_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_receipt_extractions_group" ON "receipt_extractions" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_receipt_groups_couple_date" ON "receipt_groups" USING btree ("couple_id","receipt_date");--> statement-breakpoint
CREATE INDEX "idx_receipt_groups_sender_status" ON "receipt_groups" USING btree ("sender_phone_e164","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_receipt_images_couple_sha" ON "receipt_images" USING btree ("couple_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_receipt_images_group_page" ON "receipt_images" USING btree ("group_id","page_index");--> statement-breakpoint
CREATE INDEX "idx_receipt_items_couple_category" ON "receipt_items" USING btree ("couple_id","category");--> statement-breakpoint
CREATE INDEX "idx_receipt_items_group" ON "receipt_items" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_receipt_merchants_couple_name" ON "receipt_merchants" USING btree ("couple_id","canonical_name");--> statement-breakpoint
CREATE INDEX "idx_receipt_merchants_name_trgm" ON "receipt_merchants" USING gin ("canonical_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_receipt_products_couple_name" ON "receipt_products" USING btree ("couple_id","canonical_name");--> statement-breakpoint
CREATE INDEX "idx_receipt_products_name_trgm" ON "receipt_products" USING gin ("canonical_name" gin_trgm_ops);