import { NextResponse } from 'next/server';
import { listRunIds, readRunEventsAll, buildRunFromEvents } from '@/lib/jsonl-reader';
import type { Run } from '@/lib/types';

export async function GET(
  _req: Request,
  { params }: { params: { issueId: string } },
): Promise<NextResponse> {
  try {
    const { issueId } = params;
    const runIds = await listRunIds();

    const allEvents = await readRunEventsAll(runIds);
    const runs: Run[] = runIds.map((runId, i) => buildRunFromEvents(runId, allEvents[i]));

    const filtered = runs
      .filter((run) => run.issueId === issueId)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

    return NextResponse.json(filtered, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
