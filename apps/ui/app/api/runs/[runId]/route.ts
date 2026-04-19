import { NextResponse } from 'next/server';
import { listRunIds, readRunEvents, buildRunFromEvents, buildPhasesFromEvents } from '@/lib/jsonl-reader';

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } },
): Promise<NextResponse> {
  try {
    const { runId } = params;
    const events = await readRunEvents(runId);

    if (events.length === 0) {
      const allIds = await listRunIds();
      if (!allIds.includes(runId)) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      }
    }

    const run = buildRunFromEvents(runId, events);
    const phases = buildPhasesFromEvents(events);

    return NextResponse.json({ run, phases }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
