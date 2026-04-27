import { NextResponse } from 'next/server';
import { readRunEvents, buildPhasesFromEvents, buildRunFromEvents } from '@/lib/jsonl-reader';

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } },
): Promise<NextResponse> {
  const { runId } = params;
  try {
    const events = await readRunEvents(runId);

    if (events.length === 0) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const run = buildRunFromEvents(runId, events);
    const phases = buildPhasesFromEvents(events);

    const finished = run.finishedAt != null;
    const cacheControl = finished ? 'public, max-age=300, stale-while-revalidate=60' : 'no-store';

    return NextResponse.json(
      {
        run_start: run.startedAt,
        run_end: run.finishedAt,
        phases: phases.map((p) => ({
          id: `${runId}__${p.phase}`,
          name: p.phase,
          status: p.finishedAt ? 'finished' : 'running',
          started_at: p.startedAt,
          finished_at: p.finishedAt,
          gate_decision: p.gate,
        })),
      },
      { headers: { 'Cache-Control': cacheControl } },
    );
  } catch (err) {
    console.error('[phases] error', { runId, err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
