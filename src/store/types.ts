/**
 * Plain domain types for ForjaStore.
 * These types are intentionally decoupled from any ORM.
 * Timestamps are represented as ISO 8601 strings.
 * Numeric (decimal) values are represented as strings (pg driver behavior).
 */

export interface Run {
  id: string;
  issueId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'init' | 'spec' | 'dev' | 'test' | 'perf' | 'security' | 'review' | 'homolog' | 'pr' | 'done' | 'failed';
  gitBranch: string | null;
  gitSha: string | null;
  model: string | null;
  totalCost: string;
  totalTokens: number;
  schemaVersion: string;
}

export type NewRun = Omit<Run, 'id' | 'schemaVersion'>;

export interface Phase {
  id: string;
  runId: string;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  schemaVersion: string;
}

export type NewPhase = Omit<Phase, 'id' | 'schemaVersion'>;

export interface Agent {
  id: string;
  runId: string;
  phaseId: string;
  name: string;
  model: string;
  spanId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: string;
}

export type NewAgent = Omit<Agent, 'id'>;

export interface Finding {
  id: string;
  runId: string;
  phaseId: string;
  agentId: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  filePath: string | null;
  line: number | null;
  title: string;
  description: string;
  suggestion: string | null;
  owasp: string | null;
  cwe: string | null;
  createdAt: string;
  schemaVersion: string;
}

export type NewFinding = Omit<Finding, 'id' | 'schemaVersion'>;

export interface ToolCall {
  id: string;
  runId: string;
  phaseId: string;
  agentId: string;
  spanId: string | null;
  tool: string;
  input: unknown;
  output: unknown | null;
  durationMs: number | null;
  createdAt: string;
  schemaVersion: string;
}

export type NewToolCall = Omit<ToolCall, 'id' | 'schemaVersion'>;

export interface CostEvent {
  id: string;
  runId: string;
  phaseId: string;
  agentId: string;
  spanId: string | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: string;
  createdAt: string;
  schemaVersion: string;
}

export type NewCostEvent = Omit<CostEvent, 'id' | 'schemaVersion'>;

export interface GateDecision {
  id: string;
  runId: string;
  phaseId: string | null;
  decision: 'pass' | 'warn' | 'fail';
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  policyApplied: string;
  justification: string | null;
  decidedAt: string;
  schemaVersion: string;
}

export type NewGateDecision = Omit<GateDecision, 'id' | 'schemaVersion'>;

export interface IssueLink {
  id: string;
  runId: string;
  issueId: string;
  issueUrl: string | null;
  title: string | null;
  linkedAt: string;
  schemaVersion: string;
}

export type NewIssueLink = Omit<IssueLink, 'id' | 'schemaVersion'>;

export interface CostSummary {
  phaseId: string;
  totalCost: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
}
