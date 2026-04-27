CREATE INDEX IF NOT EXISTS runs_started_at_idx ON runs(started_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS gate_decisions_run_decided_idx ON gate_decisions(run_id, decided_at DESC);

-- Down migration (run manually to reverse):
-- DROP INDEX IF EXISTS runs_started_at_idx;
-- DROP INDEX IF EXISTS gate_decisions_run_decided_idx;
