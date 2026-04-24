import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
  customType,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const runStatusEnum = pgEnum('run_status', [
  'init', 'spec', 'dev', 'test', 'perf', 'security', 'review', 'homolog', 'pr', 'done', 'failed',
]);

export const severityEnum = pgEnum('severity', ['critical', 'high', 'medium', 'low']);

export const gateDecisionEnum = pgEnum('gate_decision', ['pass', 'warn', 'fail']);

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  issueId: text('issue_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: runStatusEnum('status').notNull(),
  gitBranch: text('git_branch'),
  gitSha: text('git_sha'),
  model: text('model'),
  totalCost: numeric('total_cost', { precision: 10, scale: 6 }).notNull().default('0'),
  totalTokens: integer('total_tokens').notNull().default(0),
  schemaVersion: varchar('schema_version', { length: 10 }).notNull().default('1.0'),
  searchVector: tsvector('search_vector'),
}, (t) => ({
  issueIdIdx: index('runs_issue_id_idx').on(t.issueId),
  statusIdx: index('runs_status_idx').on(t.status),
}));

export const phases = pgTable('phases', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  name: text('name').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),
  schemaVersion: varchar('schema_version', { length: 10 }).notNull().default('1.0'),
}, (t) => ({
  runIdIdx: index('phases_run_id_idx').on(t.runId),
}));

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  phaseId: uuid('phase_id').notNull().references(() => phases.id),
  name: text('name').notNull(),
  model: text('model').notNull(),
  spanId: text('span_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),
}, (t) => ({
  runIdIdx: index('agents_run_id_idx').on(t.runId),
  phaseIdIdx: index('agents_phase_id_idx').on(t.phaseId),
}));

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  phaseId: uuid('phase_id').notNull().references(() => phases.id),
  agentId: uuid('agent_id').references(() => agents.id),
  severity: severityEnum('severity').notNull(),
  category: text('category').notNull(),
  filePath: text('file_path'),
  line: integer('line'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  suggestion: text('suggestion'),
  owasp: text('owasp'),
  cwe: text('cwe'),
  fingerprint: text('fingerprint'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  schemaVersion: varchar('schema_version', { length: 10 }).notNull().default('1.0'),
}, (t) => ({
  runIdIdx: index('findings_run_id_idx').on(t.runId),
  phaseIdIdx: index('findings_phase_id_idx').on(t.phaseId),
  runSeverityIdx: index('findings_run_id_severity_idx').on(t.runId, t.severity),
  fingerprintIdx: index('findings_fingerprint_idx').on(t.fingerprint),
}));

export const toolCalls = pgTable('tool_calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  phaseId: uuid('phase_id').notNull().references(() => phases.id),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  spanId: text('span_id'),
  tool: text('tool').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  schemaVersion: varchar('schema_version', { length: 10 }).notNull().default('1.0'),
}, (t) => ({
  runIdIdx: index('tool_calls_run_id_idx').on(t.runId),
  phaseIdIdx: index('tool_calls_phase_id_idx').on(t.phaseId),
  agentIdIdx: index('tool_calls_agent_id_idx').on(t.agentId),
}));

export const costEvents = pgTable('cost_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  phaseId: uuid('phase_id').notNull().references(() => phases.id),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  spanId: text('span_id'),
  model: text('model').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  schemaVersion: varchar('schema_version', { length: 10 }).notNull().default('1.0'),
}, (t) => ({
  runIdIdx: index('cost_events_run_id_idx').on(t.runId),
  phaseIdIdx: index('cost_events_phase_id_idx').on(t.phaseId),
  agentIdIdx: index('cost_events_agent_id_idx').on(t.agentId),
}));

export const gateDecisions = pgTable('gate_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  phaseId: uuid('phase_id').references(() => phases.id),
  decision: gateDecisionEnum('decision').notNull(),
  criticalCount: integer('critical_count').notNull().default(0),
  highCount: integer('high_count').notNull().default(0),
  mediumCount: integer('medium_count').notNull().default(0),
  lowCount: integer('low_count').notNull().default(0),
  policyApplied: text('policy_applied').notNull(),
  justification: text('justification'),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  schemaVersion: varchar('schema_version', { length: 10 }).notNull().default('1.0'),
}, (t) => ({
  runIdIdx: index('gate_decisions_run_id_idx').on(t.runId),
  runPhaseIdx: index('gate_decisions_run_id_phase_id_idx').on(t.runId, t.phaseId),
}));

export const issueLinks = pgTable('issue_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  issueId: text('issue_id').notNull(),
  issueUrl: text('issue_url'),
  title: text('title'),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
  schemaVersion: varchar('schema_version', { length: 10 }).notNull().default('1.0'),
}, (t) => ({
  runIdIdx: index('issue_links_run_id_idx').on(t.runId),
}));
