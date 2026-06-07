ALTER TABLE "members" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_email_unique" UNIQUE("email");