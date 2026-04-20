import { NextResponse } from 'next/server';
import { listRunIds, readRunEventsAll, buildRunFromEvents } from '@/lib/jsonl-reader';
import type { Run } from '@/lib/types';

interface IssueSummary {
  issueId: string;
  runCount: number;
  lastGate: 'pass' | 'warn' | 'fail' | null;
  lastRun: string;
}

export async function GET(): Promise<NextResponse> {
  try {
    const runIds = await listRunIds();

    const allEvents = await readRunEventsAll(runIds);
    const runs: Run[] = runIds.map((runId, i) => buildRunFromEvents(runId, allEvents[i]));

    runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

    const map = new Map<string, IssueSummary>();

    for (const run of runs) {
      if (!map.has(run.issueId)) {
        map.set(run.issueId, {
          issueId: run.issueId,
          runCount: 1,
          lastGate: run.gateFinal,
          lastRun: run.startedAt,
        });
      } else {
        const row = map.get(run.issueId)!;
        row.runCount += 1;
      }
    }

    const issues = Array.from(map.values()).sort((a, b) =>
      a.lastRun < b.lastRun ? 1 : -1
    );

    return NextResponse.json(issues, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
