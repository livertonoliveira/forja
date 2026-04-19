export type {
  Run, NewRun,
  Phase, NewPhase,
  Agent, NewAgent,
  Finding, NewFinding,
  ToolCall, NewToolCall,
  CostEvent, NewCostEvent,
  GateDecision, NewGateDecision,
  IssueLink, NewIssueLink,
  CostSummary,
} from './types.js';

import type {
  Run, NewRun,
  Phase, NewPhase,
  Agent, NewAgent,
  Finding, NewFinding,
  ToolCall, NewToolCall,
  CostEvent, NewCostEvent,
  CostSummary,
  GateDecision, NewGateDecision,
  IssueLink, NewIssueLink,
} from './types.js';

export interface ForjaStore {
  createRun(data: NewRun): Promise<Run>;
  updateRun(id: string, data: Partial<Omit<NewRun, 'id'>>): Promise<Run>;
  getRun(id: string): Promise<Run | null>;
  listRuns(filter?: { issueId?: string; status?: string }): Promise<Run[]>;

  createPhase(data: NewPhase): Promise<Phase>;
  updatePhase(id: string, data: Partial<Omit<NewPhase, 'id'>>): Promise<Phase>;
  getPhase(id: string): Promise<Phase | null>;
  listPhases(runId: string): Promise<Phase[]>;

  createAgent(data: NewAgent): Promise<Agent>;
  updateAgent(id: string, data: Partial<Omit<NewAgent, 'id'>>): Promise<Agent>;

  insertFinding(data: NewFinding): Promise<Finding>;
  insertFindings(data: NewFinding[]): Promise<Finding[]>;
  listFindings(filter: { runId?: string; phaseId?: string; severity?: string }): Promise<Finding[]>;

  insertToolCall(data: NewToolCall): Promise<ToolCall>;

  insertCostEvent(data: NewCostEvent): Promise<CostEvent>;
  costSummaryByPhase(runId: string): Promise<CostSummary[]>;

  insertGateDecision(data: NewGateDecision): Promise<GateDecision>;
  getLatestGateDecision(runId: string, phaseId?: string): Promise<GateDecision | null>;

  linkIssue(data: NewIssueLink): Promise<IssueLink>;
  listIssueLinks(runId: string): Promise<IssueLink[]>;

  transitionRunStatus(id: string, expectedFrom: Run['status'], to: Run['status']): Promise<Run>;

  deleteRunsBefore(beforeDate: Date, options?: { dryRun?: boolean }): Promise<{
    runIds: string[];
  }>;

  ping(): Promise<void>;
  close(): Promise<void>;
}
