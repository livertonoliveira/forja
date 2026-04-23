import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

type MetricType = 'runs' | 'critical_findings' | 'cost';
type Row = { date: Date | string; hour: number; value: number };

const VALID_METRICS = new Set<MetricType>(['runs', 'critical_findings', 'cost']);

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get('metric') ?? 'runs';
  const metric: MetricType = VALID_METRICS.has(rawMetric as MetricType)
    ? (rawMetric as MetricType)
    : 'runs';
  const project = searchParams.get('project') ?? null;

  const empty = { cells: [], max: 0 };

  try {
    const db = await getPool();
    if (!db) {
      return NextResponse.json(empty, { status: 200 });
    }

    let queryText: string;
    let queryParams: string[];

    if (metric === 'critical_findings') {
      if (project) {
        queryText = `
          SELECT
            DATE(f.created_at AT TIME ZONE 'UTC') as date,
            EXTRACT(HOUR FROM f.created_at AT TIME ZONE 'UTC')::int as hour,
            COUNT(*)::int as value
          FROM findings f
          JOIN runs r ON r.id = f.run_id
          WHERE f.severity = 'critical'
            AND f.created_at >= NOW() - INTERVAL '365 days'
            AND r.issue_id ILIKE $1
          GROUP BY 1, 2
          ORDER BY 1, 2
        `;
        queryParams = [`%${project}%`];
      } else {
        queryText = `
          SELECT
            DATE(created_at AT TIME ZONE 'UTC') as date,
            EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int as hour,
            COUNT(*)::int as value
          FROM findings
          WHERE severity = 'critical'
            AND created_at >= NOW() - INTERVAL '365 days'
          GROUP BY 1, 2
          ORDER BY 1, 2
        `;
        queryParams = [];
      }
    } else if (metric === 'cost') {
      if (project) {
        queryText = `
          SELECT
            DATE(started_at AT TIME ZONE 'UTC') as date,
            EXTRACT(HOUR FROM started_at AT TIME ZONE 'UTC')::int as hour,
            SUM(total_cost::numeric)::float as value
          FROM runs
          WHERE started_at >= NOW() - INTERVAL '365 days'
            AND issue_id ILIKE $1
          GROUP BY 1, 2
          ORDER BY 1, 2
        `;
        queryParams = [`%${project}%`];
      } else {
        queryText = `
          SELECT
            DATE(started_at AT TIME ZONE 'UTC') as date,
            EXTRACT(HOUR FROM started_at AT TIME ZONE 'UTC')::int as hour,
            SUM(total_cost::numeric)::float as value
          FROM runs
          WHERE started_at >= NOW() - INTERVAL '365 days'
          GROUP BY 1, 2
          ORDER BY 1, 2
        `;
        queryParams = [];
      }
    } else {
      if (project) {
        queryText = `
          SELECT
            DATE(started_at AT TIME ZONE 'UTC') as date,
            EXTRACT(HOUR FROM started_at AT TIME ZONE 'UTC')::int as hour,
            COUNT(*)::int as value
          FROM runs
          WHERE started_at >= NOW() - INTERVAL '365 days'
            AND issue_id ILIKE $1
          GROUP BY 1, 2
          ORDER BY 1, 2
        `;
        queryParams = [`%${project}%`];
      } else {
        queryText = `
          SELECT
            DATE(started_at AT TIME ZONE 'UTC') as date,
            EXTRACT(HOUR FROM started_at AT TIME ZONE 'UTC')::int as hour,
            COUNT(*)::int as value
          FROM runs
          WHERE started_at >= NOW() - INTERVAL '365 days'
          GROUP BY 1, 2
          ORDER BY 1, 2
        `;
        queryParams = [];
      }
    }

    const { rows } = await db.query<Row>(queryText, queryParams);

    const cells = rows.map(r => {
      const dateStr = r.date instanceof Date
        ? r.date.toISOString().split('T')[0]
        : String(r.date).split('T')[0];
      return { date: dateStr, hour: r.hour, value: r.value };
    });

    const max = cells.length > 0 ? Math.max(...cells.map(c => c.value)) : 0;

    return NextResponse.json({ cells, max }, { status: 200 });
  } catch (err) {
    console.error('[api/heatmap]', err);
    return NextResponse.json(empty, { status: 200 });
  }
}
