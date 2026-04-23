ALTER TABLE runs ADD COLUMN IF NOT EXISTS search_vector tsvector;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS runs_search_idx ON runs USING GIN(search_vector);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS cost_events_created_at_idx ON cost_events(created_at);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION update_runs_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.issue_id, '') || ' ' ||
    coalesce(NEW.status::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS runs_search_vector_update ON runs;
--> statement-breakpoint

CREATE TRIGGER runs_search_vector_update
  BEFORE INSERT OR UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION update_runs_search_vector();
--> statement-breakpoint

UPDATE runs SET search_vector = to_tsvector('english',
  coalesce(issue_id, '') || ' ' ||
  coalesce(status::text, '')
) WHERE search_vector IS NULL;

-- Down migration (run manually to reverse):
-- DROP TRIGGER IF EXISTS runs_search_vector_update ON runs;
-- DROP FUNCTION IF EXISTS update_runs_search_vector();
-- DROP INDEX IF EXISTS runs_search_idx;
-- DROP INDEX IF EXISTS cost_events_created_at_idx;
-- ALTER TABLE runs DROP COLUMN IF EXISTS search_vector;
