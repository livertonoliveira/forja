import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import path from 'path';
import { listRunIds, readRunEvents } from '@/lib/jsonl-reader';
import type { Finding } from '@/lib/types';

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filterRunId = url.searchParams.get('runId');

    const allRunIds = await listRunIds();
    const runIds = filterRunId ? allRunIds.filter((id) => id === filterRunId) : allRunIds;

    const grouped: Record<'critical' | 'high' | 'medium' | 'low', Finding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const runId of runIds) {
      const events = await readRunEvents(runId);

      const phaseNameById: Record<string, string> = {};
      for (const e of events) {
        if (e.eventType === 'phase_start' && e.phaseId) {
          const name = (e.payload?.phase as string | undefined) ?? e.phaseId;
          phaseNameById[e.phaseId] = name;
        }
      }

      const findingEvents = events.filter((e) => e.eventType === 'finding');

      findingEvents.forEach((e, index) => {
        const p = e.payload;
        const rawSev = p.severity as string | undefined;
        const severity = VALID_SEVERITIES.has(rawSev ?? '')
          ? (rawSev as 'critical' | 'high' | 'medium' | 'low')
          : 'low';

        const phaseId = e.phaseId;
        const phase = phaseId ? (phaseNameById[phaseId] ?? phaseId) : null;

        const rawFile = (p.filePath as string | undefined) ?? null;
        const file = rawFile
          ? (rawFile.match(/(?:src|apps|packages)\/.+/) ?? [null])[0] ?? path.basename(rawFile)
          : null;

        const finding: Finding = {
          id: (p.id as string | undefined) ?? `${runId}-${index}`,
          severity,
          category: (p.category as string | undefined) ?? 'unknown',
          message:
            (p.title as string | undefined) ??
            (p.description as string | undefined) ??
            'No message',
          file,
          runId,
          phase,
        };

        grouped[severity].push(finding);
      });
    }

    const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    return NextResponse.json({ ...grouped, total });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
