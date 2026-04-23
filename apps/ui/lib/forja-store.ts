import { listRunIds, readRunEventsAll, readRunSummaryEventsAll, buildRunFromEvents } from './jsonl-reader';
import { parseFindings } from './findings-parser';
import { getPool } from './db';
import type { Finding } from './types';

type RunStatus = 'init' | 'spec' | 'dev' | 'test' | 'perf' | 'security' | 'review' | 'homolog' | 'pr' | 'done' | 'failed';
type GateDecision = 'pass' | 'warn' | 'fail';

export async function listAllFindings(): Promise<Finding[]> {
  const runIds = await listRunIds();
  const allEvents = await readRunEventsAll(runIds);
  return runIds.flatMap((runId, i) => parseFindings(runId, allEvents[i]));
}

export interface RunSummary {
  id: string;
  issueId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  totalCost: string;
  gate: GateDecision | null;
}

type DbRunRow = {
  id: string; issue_id: string; status: RunStatus;
  started_at: string; finished_at: string | null;
  total_cost: string; gate: GateDecision | null;
};

function rowToRunSummary(r: DbRunRow): RunSummary {
  return {
    id: r.id,
    issueId: r.issue_id,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.finished_at
      ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
      : null,
    totalCost: r.total_cost,
    gate: r.gate,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonlRunToSummary(runId: string, events: any[]): RunSummary {
  const run = buildRunFromEvents(runId, events);
  return {
    id: run.id,
    issueId: run.issueId,
    status: run.status as RunStatus,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.finishedAt
      ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
      : null,
    totalCost: run.totalCostUsd,
    gate: run.gateFinal,
  };
}

async function listRunsFromJsonl(limit: number): Promise<RunSummary[]> {
  const runIds = await listRunIds();
  if (runIds.length === 0) return [];
  const allEvents = await readRunSummaryEventsAll(runIds);
  return runIds
    .map((runId, i) => jsonlRunToSummary(runId, allEvents[i]))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit);
}

export async function listRecentRuns(limit = 10): Promise<RunSummary[]> {
  const db = await getPool();
  if (!db) return listRunsFromJsonl(limit);

  try {
    const { rows } = await db.query<{
      id: string; issue_id: string; status: RunStatus;
      started_at: string; finished_at: string | null;
      total_cost: string; gate: GateDecision | null;
    }>(
      `SELECT r.id, r.issue_id, r.status, r.started_at, r.finished_at, r.total_cost,
              g.decision as gate
       FROM runs r
       LEFT JOIN LATERAL (
         SELECT decision FROM gate_decisions WHERE run_id = r.id ORDER BY decided_at DESC LIMIT 1
       ) g ON true
       ORDER BY r.started_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows.map(rowToRunSummary);
  } catch (err) {
    console.error('[forja-store] DB query failed, falling back to JSONL:', err);
    return listRunsFromJsonl(limit);
  }
}

export interface RunFilters {
  q?: string
  from?: string
  to?: string
  gate?: string[]
}

async function listRunsFromJsonlFiltered(filters: RunFilters): Promise<RunSummary[]> {
  const runIds = await listRunIds();
  if (runIds.length === 0) return [];
  const allEvents = await readRunSummaryEventsAll(runIds);
  let results = runIds.map((runId, i) => jsonlRunToSummary(runId, allEvents[i]));
  if (filters.q) {
    const lower = filters.q.toLowerCase();
    results = results.filter(r =>
      r.issueId?.toLowerCase().includes(lower) ||
      r.status?.toLowerCase().includes(lower)
    );
  }
  if (filters.from) {
    results = results.filter(r => r.startedAt >= filters.from!);
  }
  if (filters.to) {
    results = results.filter(r => r.startedAt <= filters.to! + 'T23:59:59');
  }
  if (filters.gate && filters.gate.length > 0) {
    results = results.filter(r => filters.gate!.includes(r.gate as string));
  }
  return results.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, 500);
}

export async function listRuns(filters: RunFilters = {}): Promise<RunSummary[]> {
  const db = await getPool();
  if (!db) return listRunsFromJsonlFiltered(filters);

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.q) {
      params.push(filters.q);
      conditions.push(`r.search_vector @@ plainto_tsquery('english', $${params.length})`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`r.started_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`r.started_at <= ($${params.length}::date + interval '1 day')`);
    }
    if (filters.gate && filters.gate.length > 0) {
      params.push(filters.gate);
      conditions.push(`g.decision = ANY($${params.length}::text[])`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query<{
      id: string; issue_id: string; status: RunStatus;
      started_at: string; finished_at: string | null;
      total_cost: string; gate: GateDecision | null;
    }>(
      `SELECT r.id, r.issue_id, r.status, r.started_at, r.finished_at, r.total_cost,
              g.decision as gate
       FROM runs r
       LEFT JOIN LATERAL (
         SELECT decision FROM gate_decisions WHERE run_id = r.id ORDER BY decided_at DESC LIMIT 1
       ) g ON true
       ${where}
       ORDER BY r.started_at DESC
       LIMIT 500`,
      params
    );
    return rows.map(rowToRunSummary);
  } catch (err) {
    console.error('[forja-store] listRuns DB query failed, falling back to JSONL:', err);
    return listRunsFromJsonlFiltered(filters);
  }
}

export async function searchRuns(query: string): Promise<RunSummary[]> {
  const db = await getPool();
  if (db) {
    try {
      const { rows } = await db.query<{
        id: string; issue_id: string; status: RunStatus;
        started_at: string; finished_at: string | null;
        total_cost: string; gate: GateDecision | null;
      }>(
        `SELECT r.id, r.issue_id, r.status, r.started_at, r.finished_at, r.total_cost,
                g.decision as gate
         FROM runs r
         LEFT JOIN LATERAL (
           SELECT decision FROM gate_decisions WHERE run_id = r.id ORDER BY decided_at DESC LIMIT 1
         ) g ON true
         WHERE r.search_vector @@ plainto_tsquery('english', $1)
         ORDER BY r.started_at DESC
         LIMIT 100`,
        [query]
      );
      return rows.map(rowToRunSummary);
    } catch (err) {
      console.error('[forja-store] searchRuns DB query failed, falling back to JSONL:', err);
    }
  }

  const lower = query.toLowerCase();
  const all = await listRunsFromJsonl(1000);
  return all.filter(r =>
    r.issueId?.toLowerCase().includes(lower) ||
    r.status?.toLowerCase().includes(lower)
  );
}

// ─── Trend Analysis ───────────────────────────────────────────────────────────

export type TrendMetric = 'findings' | 'gate_fail_rate' | 'run_duration' | 'cost';
export type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TrendFilters {
  metric: TrendMetric;
  granularity: TrendGranularity;
  from: string;
  to: string;
  project?: string;
}

export type FindingsBucket = {
  bucket: string;
  critical: number | null;
  high: number | null;
  medium: number | null;
  low: number | null;
};

export type CostBucket = {
  bucket: string;
  totalCost: string | null;
};

export type GateBucket = {
  bucket: string;
  pass: number | null;
  warn: number | null;
  fail: number | null;
};

export type DurationBucket = {
  bucket: string;
  avgDurationMs: number | null;
};

export type TrendBucket = FindingsBucket | CostBucket | GateBucket | DurationBucket;

function truncateToBucket(date: Date, granularity: TrendGranularity): Date {
  const d = new Date(date);
  if (granularity === 'hour') {
    d.setMinutes(0, 0, 0);
  } else if (granularity === 'day') {
    d.setHours(0, 0, 0, 0);
  } else if (granularity === 'week') {
    const day = d.getDay(); // 0=Sun
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
  } else {
    // month
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

function stepBucket(date: Date, granularity: TrendGranularity): Date {
  const d = new Date(date);
  if (granularity === 'hour') {
    d.setHours(d.getHours() + 1);
  } else if (granularity === 'day') {
    d.setDate(d.getDate() + 1);
  } else if (granularity === 'week') {
    d.setDate(d.getDate() + 7);
  } else {
    // month
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

function fillGaps<T extends { bucket: string }>(
  rows: T[],
  from: string,
  to: string,
  granularity: TrendGranularity,
  emptyBucket: (bucket: string) => T,
): T[] {
  const rowMap = new Map<string, T>();
  for (const row of rows) {
    const key = new Date(row.bucket).toISOString();
    rowMap.set(key, row);
  }

  const result: T[] = [];
  const end = new Date(to);
  let cursor = truncateToBucket(new Date(from), granularity);

  while (cursor <= end) {
    const key = cursor.toISOString();
    result.push(rowMap.get(key) ?? emptyBucket(key));
    cursor = stepBucket(cursor, granularity);
  }

  return result;
}

async function queryFindingsTrend(
  granularity: TrendGranularity,
  from: string,
  to: string,
  project: string | undefined,
  db: import('pg').Pool,
): Promise<FindingsBucket[]> {
  type FindingsRow = { bucket: string; severity: string; count: number };

  const conditions: string[] = ['f.created_at BETWEEN $2 AND $3'];
  const params: unknown[] = [granularity, from, to];

  if (project) {
    params.push(`${project}%`);
    conditions.push(`r.issue_id ILIKE $${params.length}`);
  }

  const where = conditions.join(' AND ');
  const sql = `SELECT date_trunc($1, f.created_at) AS bucket,
                      f.severity,
                      COUNT(*)::int AS count
               FROM findings f
               JOIN runs r ON r.id = f.run_id
               WHERE ${where}
               GROUP BY bucket, f.severity
               ORDER BY bucket`;

  const { rows } = await db.query<FindingsRow>(sql, params);

  // Aggregate rows by bucket
  const bucketMap = new Map<string, FindingsBucket>();
  for (const row of rows) {
    const key = new Date(row.bucket).toISOString();
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { bucket: key, critical: null, high: null, medium: null, low: null });
    }
    const b = bucketMap.get(key)!;
    const sev = row.severity as 'critical' | 'high' | 'medium' | 'low';
    b[sev] = row.count;
  }

  return fillGaps<FindingsBucket>(
    Array.from(bucketMap.values()),
    from,
    to,
    granularity,
    (bucket) => ({ bucket, critical: null, high: null, medium: null, low: null }),
  );
}

async function queryGateFailRateTrend(
  granularity: TrendGranularity,
  from: string,
  to: string,
  db: import('pg').Pool,
): Promise<GateBucket[]> {
  type GateRow = { bucket: string; decision: string; count: number };

  const { rows } = await db.query<GateRow>(
    `SELECT date_trunc($1, g.decided_at) AS bucket,
            g.decision,
            COUNT(*)::int AS count
     FROM gate_decisions g
     WHERE g.decided_at BETWEEN $2 AND $3
     GROUP BY bucket, g.decision
     ORDER BY bucket`,
    [granularity, from, to],
  );

  const bucketMap = new Map<string, GateBucket>();
  for (const row of rows) {
    const key = new Date(row.bucket).toISOString();
    if (!bucketMap.has(key)) {
      bucketMap.set(key, { bucket: key, pass: null, warn: null, fail: null });
    }
    const b = bucketMap.get(key)!;
    const dec = row.decision as 'pass' | 'warn' | 'fail';
    b[dec] = row.count;
  }

  return fillGaps<GateBucket>(
    Array.from(bucketMap.values()),
    from,
    to,
    granularity,
    (bucket) => ({ bucket, pass: null, warn: null, fail: null }),
  );
}

async function queryCostTrend(
  granularity: TrendGranularity,
  from: string,
  to: string,
  db: import('pg').Pool,
): Promise<CostBucket[]> {
  type CostRow = { bucket: string; total_cost: string | null };

  const { rows } = await db.query<CostRow>(
    `SELECT date_trunc($1, c.created_at) AS bucket,
            SUM(c.cost_usd)::text AS total_cost
     FROM cost_events c
     WHERE c.created_at BETWEEN $2 AND $3
     GROUP BY bucket
     ORDER BY bucket`,
    [granularity, from, to],
  );

  const mapped: CostBucket[] = rows.map((r) => ({
    bucket: new Date(r.bucket).toISOString(),
    totalCost: r.total_cost,
  }));

  return fillGaps<CostBucket>(
    mapped,
    from,
    to,
    granularity,
    (bucket) => ({ bucket, totalCost: null }),
  );
}

async function queryRunDurationTrend(
  granularity: TrendGranularity,
  from: string,
  to: string,
  db: import('pg').Pool,
): Promise<DurationBucket[]> {
  type DurationRow = { bucket: string; avg_duration_ms: number | null };

  const { rows } = await db.query<DurationRow>(
    `SELECT date_trunc($1, r.started_at) AS bucket,
            AVG(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000)::int AS avg_duration_ms
     FROM runs r
     WHERE r.started_at BETWEEN $2 AND $3
       AND r.finished_at IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket`,
    [granularity, from, to],
  );

  const mapped: DurationBucket[] = rows.map((r) => ({
    bucket: new Date(r.bucket).toISOString(),
    avgDurationMs: r.avg_duration_ms,
  }));

  return fillGaps<DurationBucket>(
    mapped,
    from,
    to,
    granularity,
    (bucket) => ({ bucket, avgDurationMs: null }),
  );
}

const ALLOWED_GRANULARITIES = new Set<TrendGranularity>(['hour', 'day', 'week', 'month']);

export async function getTrend(filters: TrendFilters): Promise<TrendBucket[]> {
  if (!ALLOWED_GRANULARITIES.has(filters.granularity)) {
    throw new Error(`invalid granularity: ${filters.granularity}`);
  }

  const db = await getPool();
  if (!db) return []; // no JSONL fallback for trend queries

  try {
    const { metric, granularity, from, to, project } = filters;
    switch (metric) {
      case 'findings':
        return queryFindingsTrend(granularity, from, to, project, db);
      case 'gate_fail_rate':
        return queryGateFailRateTrend(granularity, from, to, db);
      case 'cost':
        return queryCostTrend(granularity, from, to, db);
      case 'run_duration':
        return queryRunDurationTrend(granularity, from, to, db);
    }
  } catch (err) {
    console.error('[forja-store] getTrend DB query failed:', err);
    return [];
  }
}
