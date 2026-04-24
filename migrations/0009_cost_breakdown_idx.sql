-- Compound index to support cost breakdown query: WHERE c.created_at BETWEEN $1 AND $2 + JOIN on run_id
-- Enables index-only scan for getCostBreakdownByProject, avoiding heap lookups per row
CREATE INDEX IF NOT EXISTS cost_events_created_at_run_id_idx
  ON cost_events(created_at DESC, run_id);
