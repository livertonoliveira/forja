import { NextResponse } from 'next/server';
import { listRunIds, readRunEvents, buildRunFromEvents } from '@/lib/jsonl-reader';
import type { Run } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const runIds = await listRunIds();

    const runs: Run[] = await Promise.all(
      runIds.map(async (runId) => {
        const events = await readRunEvents(runId);
        return buildRunFromEvents(runId, events);
      }),
    );

    runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

    return NextResponse.json(runs, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
