import { NextResponse } from 'next/server';
import { getTrend } from '@/lib/forja-store';
import type { TrendMetric, TrendGranularity } from '@/lib/forja-store';

const VALID_METRICS = new Set(['findings', 'gate_fail_rate', 'run_duration', 'cost']);
const VALID_GRANULARITIES = new Set(['hour', 'day', 'week', 'month']);

const MAX_BUCKETS: Record<TrendGranularity, number> = {
  hour: 2160,  // 90 days
  day: 365,
  week: 104,
  month: 60,
};

const BUCKET_MS: Record<TrendGranularity, number> = {
  hour: 3600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

export const revalidate = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const metric = searchParams.get('metric');
  if (!metric || !VALID_METRICS.has(metric)) {
    return NextResponse.json({ error: 'invalid metric' }, { status: 400 });
  }

  const granularityParam = searchParams.get('granularity') ?? 'day';
  if (!VALID_GRANULARITIES.has(granularityParam)) {
    return NextResponse.json({ error: 'invalid granularity' }, { status: 400 });
  }
  const granularity = granularityParam as TrendGranularity;

  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const defaultTo = new Date().toISOString();

  const fromParam = searchParams.get('from') ?? defaultFrom;
  const toParam = searchParams.get('to') ?? defaultTo;

  if (isNaN(Date.parse(fromParam)) || isNaN(Date.parse(toParam))) {
    return NextResponse.json({ error: 'invalid date range' }, { status: 400 });
  }

  const fromMs = Date.parse(fromParam);
  const toMs = Date.parse(toParam);
  if (fromMs > toMs) {
    return NextResponse.json({ error: 'from must be before to' }, { status: 400 });
  }

  const estimatedBuckets = Math.ceil((toMs - fromMs) / BUCKET_MS[granularity]);
  if (estimatedBuckets > MAX_BUCKETS[granularity]) {
    return NextResponse.json(
      { error: `date range too large for granularity=${granularity}; use a coarser granularity or a shorter window` },
      { status: 400 },
    );
  }

  const project = searchParams.get('project') ?? undefined;

  try {
    const data = await getTrend({
      metric: metric as TrendMetric,
      granularity,
      from: fromParam,
      to: toParam,
      project,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('[api/trend] failed:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
