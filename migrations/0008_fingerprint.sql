ALTER TABLE "findings" ADD COLUMN IF NOT EXISTS "fingerprint" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_fingerprint_idx" ON "findings" ("fingerprint");
