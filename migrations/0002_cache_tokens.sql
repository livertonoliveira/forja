ALTER TABLE "cost_events" ADD COLUMN "cache_creation_tokens" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "cache_read_tokens" integer NOT NULL DEFAULT 0;
