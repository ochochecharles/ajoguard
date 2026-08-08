ALTER TABLE "groups" ADD COLUMN "join_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_join_code_unique" UNIQUE("join_code");