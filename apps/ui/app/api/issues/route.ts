import { NextResponse } from 'next/server';
import { listRunIds, readRunEventsAll, buildRunFromEvents } from '@/lib/jsonl-reader';
import { MOCK_RUNS } from '@/lib/mock-data';
import type { Run } from '@/lib/types';

interface IssueSummary {
  issueId: string;
  runCount: number;
  lastGate: 'pass' | 'warn' | 'fail' | null;
  lastRun: string;
}

function buildIssuesFromRuns(runs: Run[]): IssueSummary[] {
  const map = new Map<string, IssueSummary>();
  const sorted = [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  for (const run of sorted) {
    if (!map.has(run.issueId)) {
      map.set(run.issueId, { issueId: run.issueId, runCount: 1, lastGate: run.gateFinal, lastRun: run.startedAt });
    } else {
      map.get(run.issueId)!.runCount += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.lastRun < b.lastRun ? 1 : -1));
}

export async function GET(): Promise<NextResponse> {
  try {
    const runIds = await listRunIds();

    if (runIds.length === 0) {
      return NextResponse.json(buildIssuesFromRuns(MOCK_RUNS), { status: 200 });
    }

    const allEvents = await readRunEventsAll(runIds);
    const runs: Run[] = runIds.map((runId, i) => buildRunFromEvents(runId, allEvents[i]));
    return NextResponse.json(buildIssuesFromRuns(runs), { status: 200 });
  } catch {
    return NextResponse.json(buildIssuesFromRuns(MOCK_RUNS), { status: 200 });
  }
}
