CREATE TYPE "public"."channel" AS ENUM('SMS', 'WHATSAPP', 'WEB');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('MEMBER', 'COLLECTOR');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"sequence_num" integer NOT NULL,
	"entry_data" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"entry_hash" text NOT NULL,
	"hmac_sig" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_logs_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" integer NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "contribution_status" DEFAULT 'PENDING' NOT NULL,
	"idempotency_key" text NOT NULL,
	"raw_payload" text NOT NULL,
	"failure_reason" text,
	"processed_at" timestamp,
	"member_id" uuid NOT NULL,
	"collector_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cycle_amount" integer NOT NULL,
	"cycle_interval" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_number" text,
	"role" "member_role" DEFAULT 'MEMBER' NOT NULL,
	"status" "member_status" DEFAULT 'ACTIVE' NOT NULL,
	"group_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" text NOT NULL,
	"channel" "channel" NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_collector_id_members_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;