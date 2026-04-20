export interface Run {
  id: string;
  issueId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalTokens: number;
  totalCostUsd: string;
  gateFinal: 'pass' | 'warn' | 'fail' | null;
}

export interface RunPhase {
  phase: string;
  startedAt: string;
  finishedAt: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: string;
  gate: 'pass' | 'warn' | 'fail' | null;
}

export interface Finding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  message: string;
  file: string | null;
  runId: string;
  phase: string | null;
}

export interface CostSummary {
  totalUsd: string;
  byRun: Record<string, string>;
  byModel: Record<string, string>;
  byPhase: Record<string, string>;
}
