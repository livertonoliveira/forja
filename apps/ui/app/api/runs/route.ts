import { NextResponse } from 'next/server';
import { listRunIds, readRunEventsAll, buildRunFromEvents } from '@/lib/jsonl-reader';
import type { Run } from '@/lib/types';

const MOCK_RUNS: Run[] = [
  { id: 'run-001', issueId: 'MOB-1099', status: 'done', startedAt: new Date(Date.now() - 1 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 0.5 * 3600000).toISOString(), totalTokens: 84000, totalCostUsd: '0.042', gateFinal: 'pass' },
  { id: 'run-002', issueId: 'MOB-1098', status: 'failed', startedAt: new Date(Date.now() - 4 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 3.5 * 3600000).toISOString(), totalTokens: 76000, totalCostUsd: '0.038', gateFinal: 'fail' },
  { id: 'run-003', issueId: 'MOB-1097', status: 'done', startedAt: new Date(Date.now() - 8 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 7 * 3600000).toISOString(), totalTokens: 142000, totalCostUsd: '0.071', gateFinal: 'pass' },
  { id: 'run-004', issueId: 'MOB-1096', status: 'done', startedAt: new Date(Date.now() - 12 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 11 * 3600000).toISOString(), totalTokens: 110000, totalCostUsd: '0.055', gateFinal: 'warn' },
  { id: 'run-005', issueId: 'MOB-1095', status: 'test', startedAt: new Date(Date.now() - 0.25 * 3600000).toISOString(), finishedAt: null, totalTokens: 36000, totalCostUsd: '0.018', gateFinal: null },
  { id: 'run-006', issueId: 'MOB-1094', status: 'dev', startedAt: new Date(Date.now() - 0.1 * 3600000).toISOString(), finishedAt: null, totalTokens: 18000, totalCostUsd: '0.009', gateFinal: null },
  { id: 'run-007', issueId: 'MOB-1093', status: 'failed', startedAt: new Date(Date.now() - 24 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 23 * 3600000).toISOString(), totalTokens: 176000, totalCostUsd: '0.088', gateFinal: 'fail' },
  { id: 'run-008', issueId: 'MOB-1092', status: 'done', startedAt: new Date(Date.now() - 30 * 3600000).toISOString(), finishedAt: new Date(Date.now() - 29 * 3600000).toISOString(), totalTokens: 128000, totalCostUsd: '0.064', gateFinal: 'pass' },
];

export async function GET(): Promise<NextResponse> {
  try {
    const runIds = await listRunIds();

    if (runIds.length === 0) {
      return NextResponse.json(MOCK_RUNS, { status: 200 });
    }

    const allEvents = await readRunEventsAll(runIds);
    const runs: Run[] = runIds.map((runId, i) => buildRunFromEvents(runId, allEvents[i]));

    runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

    return NextResponse.json(runs, { status: 200 });
  } catch {
    return NextResponse.json(MOCK_RUNS, { status: 200 });
  }
}
