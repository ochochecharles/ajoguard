UPDATE "notification_logs" SET "channel" = 'WEB' WHERE "channel" IN ('SMS', 'WHATSAPP');--> statement-breakpoint
ALTER TABLE "contributions" ALTER COLUMN "channel" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "notification_logs" ALTER COLUMN "channel" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."channel";--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('WEB', 'TELEGRAM');--> statement-breakpoint
ALTER TABLE "contributions" ALTER COLUMN "channel" SET DATA TYPE "public"."channel" USING "channel"::"public"."channel";--> statement-breakpoint
ALTER TABLE "notification_logs" ALTER COLUMN "channel" SET DATA TYPE "public"."channel" USING "channel"::"public"."channel";