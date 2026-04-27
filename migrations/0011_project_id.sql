ALTER TABLE runs ADD COLUMN IF NOT EXISTS project_id text;
--> statement-breakpoint
UPDATE runs SET project_id = SPLIT_PART(issue_id, '-', 1) WHERE project_id IS NULL;
--> statement-breakpoint
ALTER TABLE runs ALTER COLUMN project_id SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS runs_project_id_idx ON runs(project_id);

-- Down migration:
-- DROP INDEX IF EXISTS runs_project_id_idx;
-- ALTER TABLE runs DROP COLUMN IF EXISTS project_id;
