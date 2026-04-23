import type { Run, RunPhase } from './types';

export const MOCK_RUNS: Run[] = [
  { id: 'run-001', issueId: 'MOB-1099', status: 'done', startedAt: new Date(Date.now() - 1 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 0.5 * 3600000).toISOString(), totalTokens: 84000, totalCostUsd: '0.042', gateFinal: 'pass' },
  { id: 'run-002', issueId: 'MOB-1098', status: 'failed', startedAt: new Date(Date.now() - 4 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 3.5 * 3600000).toISOString(), totalTokens: 76000, totalCostUsd: '0.038', gateFinal: 'fail' },
  { id: 'run-003', issueId: 'MOB-1097', status: 'done', startedAt: new Date(Date.now() - 8 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 7 * 3600000).toISOString(), totalTokens: 142000, totalCostUsd: '0.071', gateFinal: 'pass' },
  { id: 'run-004', issueId: 'MOB-1096', status: 'done', startedAt: new Date(Date.now() - 12 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 11 * 3600000).toISOString(), totalTokens: 110000, totalCostUsd: '0.055', gateFinal: 'warn' },
  { id: 'run-005', issueId: 'MOB-1095', status: 'test', startedAt: new Date(Date.now() - 0.25 * 3600000).toISOString(), finishedAt: null, totalTokens: 36000, totalCostUsd: '0.018', gateFinal: null },
  { id: 'run-006', issueId: 'MOB-1094', status: 'dev', startedAt: new Date(Date.now() - 0.1 * 3600000).toISOString(), finishedAt: null, totalTokens: 18000, totalCostUsd: '0.009', gateFinal: null },
  { id: 'run-007', issueId: 'MOB-1093', status: 'failed', startedAt: new Date(Date.now() - 24 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 23 * 3600000).toISOString(), totalTokens: 176000, totalCostUsd: '0.088', gateFinal: 'fail' },
  { id: 'run-008', issueId: 'MOB-1092', status: 'done', startedAt: new Date(Date.now() - 30 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 29 * 3600000).toISOString(), totalTokens: 128000, totalCostUsd: '0.064', gateFinal: 'pass' },
  { id: 'run-009', issueId: 'MOB-1099', status: 'done', startedAt: new Date(Date.now() - 48 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 47 * 3600000).toISOString(), totalTokens: 92000, totalCostUsd: '0.046', gateFinal: 'warn' },
  { id: 'run-010', issueId: 'MOB-1097', status: 'failed', startedAt: new Date(Date.now() - 72 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 71 * 3600000).toISOString(), totalTokens: 58000, totalCostUsd: '0.029', gateFinal: 'fail' },
];

export const MOCK_PHASES: Record<string, RunPhase[]> = {
  'run-001': [
    { phase: 'develop', startedAt: new Date(Date.now() - 1 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 0.83 * 3600000).toISOString(), tokensIn: 20000, tokensOut: 8000, costUsd: '0.014', gate: null },
    { phase: 'test', startedAt: new Date(Date.now() - 0.83 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 0.67 * 3600000).toISOString(), tokensIn: 18000, tokensOut: 6000, costUsd: '0.012', gate: null },
    { phase: 'review', startedAt: new Date(Date.now() - 0.67 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 0.5 * 3600000).toISOString(), tokensIn: 16000, tokensOut: 6000, costUsd: '0.016', gate: 'pass' },
  ],
  'run-002': [
    { phase: 'develop', startedAt: new Date(Date.now() - 4 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 3.67 * 3600000).toISOString(), tokensIn: 22000, tokensOut: 9000, costUsd: '0.016', gate: null },
    { phase: 'test', startedAt: new Date(Date.now() - 3.67 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 3.5 * 3600000).toISOString(), tokensIn: 24000, tokensOut: 10000, costUsd: '0.022', gate: 'fail' },
  ],
  'run-007': [
    { phase: 'develop', startedAt: new Date(Date.now() - 24 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 23.67 * 3600000).toISOString(), tokensIn: 30000, tokensOut: 12000, costUsd: '0.021', gate: null },
    { phase: 'test', startedAt: new Date(Date.now() - 23.67 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 23.33 * 3600000).toISOString(), tokensIn: 28000, tokensOut: 10000, costUsd: '0.019', gate: null },
    { phase: 'security', startedAt: new Date(Date.now() - 23.33 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 23 * 3600000).toISOString(), tokensIn: 50000, tokensOut: 18000, costUsd: '0.048', gate: 'fail' },
  ],
};

export function getMockRun(runId: string): Run | undefined {
  return MOCK_RUNS.find(r => r.id === runId);
}

export function getMockPhases(runId: string): RunPhase[] {
  return MOCK_PHASES[runId] ?? [];
}

export function getMockRunsByIssue(issueId: string): Run[] {
  return MOCK_RUNS.filter(r => r.issueId === issueId).sort((a, b) =>
    a.startedAt < b.startedAt ? 1 : -1
  );
}
