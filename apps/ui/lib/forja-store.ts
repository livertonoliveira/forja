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

async function listRunsFromJsonl(limit: number): Promise<RunSummary[]> {
  const runIds = await listRunIds();
  if (runIds.length === 0) return [];
  const allEvents = await readRunSummaryEventsAll(runIds);
  return runIds
    .map((runId, i) => {
      const run = buildRunFromEvents(runId, allEvents[i]);
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
    })
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
    console.error('[forja-store] DB query failed, falling back to JSONL:', err);
    return listRunsFromJsonl(limit);
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
