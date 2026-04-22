ALTER TABLE "runs" ADD COLUMN "schema_version" varchar(10) NOT NULL DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "phases" ADD COLUMN "schema_version" varchar(10) NOT NULL DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "schema_version" varchar(10) NOT NULL DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "gate_decisions" ADD COLUMN "schema_version" varchar(10) NOT NULL DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "tool_calls" ADD COLUMN "schema_version" varchar(10) NOT NULL DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "schema_version" varchar(10) NOT NULL DEFAULT '1.0';--> statement-breakpoint
ALTER TABLE "issue_links" ADD COLUMN "schema_version" varchar(10) NOT NULL DEFAULT '1.0';
