CREATE TYPE "public"."reconciliation_status" AS ENUM('HEALTHY', 'DISCREPANCY');--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"recorded_by_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"cycle_identifier" text NOT NULL,
	"payout_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"cycle_identifier" text NOT NULL,
	"total_expected" integer NOT NULL,
	"total_collected" integer NOT NULL,
	"missing_members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "reconciliation_status" NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "cycle_start_date" timestamp;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "total_members" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "current_position" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "payout_order" integer;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recipient_id_members_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recorded_by_id_members_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_logs" ADD CONSTRAINT "reconciliation_logs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;