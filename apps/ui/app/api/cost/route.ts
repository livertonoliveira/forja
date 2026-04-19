import { NextResponse } from 'next/server';
import { listRunIds, readRunEventsAll } from '@/lib/jsonl-reader';
import type { CostSummary } from '@/lib/types';

export async function GET(): Promise<NextResponse> {
  try {
    const runIds = await listRunIds();

    if (runIds.length === 0) {
      const empty: CostSummary = {
        totalUsd: '0.000000',
        byRun: {},
        byModel: {},
        byPhase: {},
      };
      return NextResponse.json(empty, { status: 200 });
    }

    let totalRaw = 0;
    const byRunRaw: Record<string, number> = {};
    const byModelRaw: Record<string, number> = {};
    const byPhaseRaw: Record<string, number> = {};

    const allEvents = await readRunEventsAll(runIds);

    for (let i = 0; i < runIds.length; i++) {
      const runId = runIds[i];
      const events = allEvents[i];
      let runTotal = 0;

      for (const event of events) {
        if (event.eventType !== 'cost') continue;

        const costUsd = Number(event.payload?.costUsd ?? 0);
        const cost = isNaN(costUsd) ? 0 : costUsd;

        runTotal += cost;

        const model = (event.payload?.model as string | undefined) ?? 'unknown';
        byModelRaw[model] = (byModelRaw[model] ?? 0) + cost;

        const phase =
          (event.payload?.phase as string | undefined) ??
          event.phaseId ??
          'unknown';
        byPhaseRaw[phase] = (byPhaseRaw[phase] ?? 0) + cost;
      }

      byRunRaw[runId] = runTotal;
      totalRaw += runTotal;
    }

    const toStr = (n: number) => n.toFixed(6);

    const summary: CostSummary = {
      totalUsd: toStr(totalRaw),
      byRun: Object.fromEntries(Object.entries(byRunRaw).map(([k, v]) => [k, toStr(v)])),
      byModel: Object.fromEntries(Object.entries(byModelRaw).map(([k, v]) => [k, toStr(v)])),
      byPhase: Object.fromEntries(Object.entries(byPhaseRaw).map(([k, v]) => [k, toStr(v)])),
    };

    return NextResponse.json(summary, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
