import type {
  runs,
  phases,
  agents,
  findings,
  toolCalls,
  costEvents,
  gateDecisions,
  issueLinks,
} from './drizzle/schema.js';

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

export type Phase = typeof phases.$inferSelect;
export type NewPhase = typeof phases.$inferInsert;

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type Finding = typeof findings.$inferSelect;
export type NewFinding = typeof findings.$inferInsert;

export type ToolCall = typeof toolCalls.$inferSelect;
export type NewToolCall = typeof toolCalls.$inferInsert;

export type CostEvent = typeof costEvents.$inferSelect;
export type NewCostEvent = typeof costEvents.$inferInsert;

export type GateDecision = typeof gateDecisions.$inferSelect;
export type NewGateDecision = typeof gateDecisions.$inferInsert;

export type IssueLink = typeof issueLinks.$inferSelect;
export type NewIssueLink = typeof issueLinks.$inferInsert;

export type CostSummary = {
  phaseId: string;
  totalCost: string;
  totalTokensIn: number;
  totalTokensOut: number;
};

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

  close(): Promise<void>;
}
