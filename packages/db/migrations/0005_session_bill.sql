ALTER TABLE "sessions" ADD COLUMN "bill_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "bill_requested_by_participant_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "bill_acknowledged_at" timestamp with time zone;