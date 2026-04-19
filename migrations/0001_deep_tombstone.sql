DO $$ BEGIN
 CREATE TYPE "public"."gate_decision" AS ENUM('pass', 'warn', 'fail');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."run_status" AS ENUM('init', 'spec', 'dev', 'test', 'perf', 'security', 'review', 'homolog', 'pr', 'done', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."severity" AS ENUM('critical', 'high', 'medium', 'low');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "findings" ALTER COLUMN "severity" SET DATA TYPE severity;--> statement-breakpoint
ALTER TABLE "gate_decisions" ALTER COLUMN "decision" SET DATA TYPE gate_decision;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "status" SET DATA TYPE run_status;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_run_id_idx" ON "agents" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_phase_id_idx" ON "agents" ("phase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_events_run_id_idx" ON "cost_events" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_events_phase_id_idx" ON "cost_events" ("phase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cost_events_agent_id_idx" ON "cost_events" ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_run_id_idx" ON "findings" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_phase_id_idx" ON "findings" ("phase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_run_id_severity_idx" ON "findings" ("run_id","severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_decisions_run_id_idx" ON "gate_decisions" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gate_decisions_run_id_phase_id_idx" ON "gate_decisions" ("run_id","phase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_links_run_id_idx" ON "issue_links" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phases_run_id_idx" ON "phases" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_issue_id_idx" ON "runs" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_status_idx" ON "runs" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_calls_run_id_idx" ON "tool_calls" ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_calls_phase_id_idx" ON "tool_calls" ("phase_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tool_calls_agent_id_idx" ON "tool_calls" ("agent_id");