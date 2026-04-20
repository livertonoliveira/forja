import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listRunIds, readRunEvents } from '@/lib/jsonl-reader';
import { parseFindings } from '@/lib/findings-parser';
import type { Finding } from '@/lib/types';

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
      for (const finding of parseFindings(runId, events)) {
        grouped[finding.severity].push(finding);
      }
    }

    const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    return NextResponse.json({ ...grouped, total });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
