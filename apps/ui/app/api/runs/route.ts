import { NextResponse } from 'next/server';
import { listRunIds, readRunEventsAll, buildRunFromEvents } from '@/lib/jsonl-reader';
import type { Run } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const runIds = await listRunIds();

    if (runIds.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    const allEvents = await readRunEventsAll(runIds);
    const runs: Run[] = runIds.map((runId, i) => buildRunFromEvents(runId, allEvents[i]));

    runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

    return NextResponse.json(runs, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
