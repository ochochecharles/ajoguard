ALTER TYPE "public"."channel" ADD VALUE 'TELEGRAM';--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "telegram_user_id" text;