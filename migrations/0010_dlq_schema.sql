CREATE TYPE IF NOT EXISTS dlq_status AS ENUM ('dead', 'reprocessed', 'ignored');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS hook_dlq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_type text NOT NULL,
  payload jsonb NOT NULL,
  error_message text,
  attempts integer DEFAULT 0,
  last_attempt_at timestamptz,
  -- Retention policy: entries older than 30 days should be purged via `forja prune`
  created_at timestamptz NOT NULL DEFAULT now(),
  status dlq_status NOT NULL DEFAULT 'dead'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hook_dlq_status_idx ON hook_dlq(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hook_dlq_created_at_idx ON hook_dlq(created_at DESC);

-- Down migration:
-- DROP INDEX IF EXISTS hook_dlq_created_at_idx;
-- DROP INDEX IF EXISTS hook_dlq_status_idx;
-- DROP TABLE IF EXISTS hook_dlq;
-- DROP TYPE IF EXISTS dlq_status;
