import { NextResponse } from 'next/server';
import { getCostHeatmapByDowHour } from '@/lib/forja-store';

export const revalidate = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;

  if (from && isNaN(Date.parse(from))) {
    return NextResponse.json({ error: 'invalid from date' }, { status: 400 });
  }
  if (to && isNaN(Date.parse(to))) {
    return NextResponse.json({ error: 'invalid to date' }, { status: 400 });
  }
  if (from && to) {
    const rangeMs = Date.parse(to) - Date.parse(from);
    if (rangeMs > 365 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'date range exceeds 365 days' }, { status: 400 });
    }
    if (rangeMs < 0) {
      return NextResponse.json({ error: 'from must be before to' }, { status: 400 });
    }
  }

  try {
    const data = await getCostHeatmapByDowHour({ from, to });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[api/cost/heatmap] failed:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
