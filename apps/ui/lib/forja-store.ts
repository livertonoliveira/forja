type RunStatus = 'init' | 'spec' | 'dev' | 'test' | 'perf' | 'security' | 'review' | 'homolog' | 'pr' | 'done' | 'failed';
type GateDecision = 'pass' | 'warn' | 'fail';

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

let pool: import('pg').Pool | null = null;

async function getPool(): Promise<import('pg').Pool | null> {
  if (!process.env.DATABASE_URL) return null;
  if (pool) return pool;
  try {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return pool;
  } catch {
    return null;
  }
}

export async function listRecentRuns(limit = 10): Promise<RunSummary[]> {
  const db = await getPool();
  if (!db) return mockRuns(limit);

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
    return rows.map(r => ({
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
    }));
  } catch (err) {
    console.error('[forja-store] DB query failed, using mock data:', err);
    return mockRuns(limit);
  }
}

function mockRuns(limit: number): RunSummary[] {
  const statuses: RunStatus[] = ['done', 'failed', 'test', 'dev', 'done', 'done', 'review', 'perf', 'done', 'failed'];
  const gates: (GateDecision | null)[] = ['pass', 'fail', null, null, 'pass', 'warn', null, null, 'pass', 'fail'];
  return Array.from({ length: Math.min(limit, 10) }, (_, i) => {
    const started = new Date(Date.now() - i * 4 * 3600 * 1000);
    const finished = statuses[i] !== 'dev' && statuses[i] !== 'test'
      ? new Date(started.getTime() + (30 + i * 5) * 60 * 1000)
      : null;
    return {
      id: `mock-${String(i + 1).padStart(3, '0')}`,
      issueId: `MOB-${1000 + i}`,
      status: statuses[i],
      startedAt: started.toISOString(),
      finishedAt: finished?.toISOString() ?? null,
      durationMs: finished ? finished.getTime() - started.getTime() : null,
      totalCost: (0.04 + i * 0.015).toFixed(4),
      gate: gates[i],
    };
  });
}
