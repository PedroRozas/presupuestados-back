ALTER TABLE "receipt_allowed_senders" RENAME COLUMN "phone_e164" TO "sender_address";--> statement-breakpoint
ALTER TABLE "receipt_groups" RENAME COLUMN "sender_phone_e164" TO "sender_address";--> statement-breakpoint
ALTER TABLE "receipt_images" RENAME COLUMN "sender_phone_e164" TO "sender_address";--> statement-breakpoint
ALTER TABLE "receipt_images" RENAME COLUMN "wa_message_id" TO "channel_message_id";--> statement-breakpoint
ALTER TABLE "receipt_allowed_senders" RENAME CONSTRAINT "receipt_allowed_senders_phone_e164_unique" TO "receipt_allowed_senders_sender_address_unique";--> statement-breakpoint
ALTER TABLE "receipt_images" RENAME CONSTRAINT "receipt_images_wa_message_id_unique" TO "receipt_images_channel_message_id_unique";
