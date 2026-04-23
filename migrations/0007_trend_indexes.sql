CREATE INDEX IF NOT EXISTS cost_events_created_at_idx ON cost_events(created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS findings_created_at_idx ON findings(created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS findings_run_id_created_at_idx ON findings(run_id, created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS gate_decisions_decided_at_idx ON gate_decisions(decided_at DESC);

-- Down migration (run manually to reverse):
-- DROP INDEX IF EXISTS cost_events_created_at_idx;
-- DROP INDEX IF EXISTS findings_created_at_idx;
-- DROP INDEX IF EXISTS findings_run_id_created_at_idx;
-- DROP INDEX IF EXISTS gate_decisions_decided_at_idx;
