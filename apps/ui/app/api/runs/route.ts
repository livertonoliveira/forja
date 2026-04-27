import { NextResponse } from 'next/server';
import { listRunIds, readRunEventsAll, buildRunFromEvents } from '@/lib/jsonl-reader';
import { getPool } from '@/lib/db';
import type { Run } from '@/lib/types';

type RunRow = {
  id: string;
  issue_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  git_branch: string | null;
  git_sha: string | null;
  model: string | null;
  total_cost: string;
  total_tokens: number;
  schema_version: string;
};

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.slice(0, 200) ?? null;

  if (process.env.DATABASE_URL) {
    try {
      const db = await getPool();
      if (db) {
        let queryText: string;
        let queryParams: string[];

        if (q) {
          queryText = `SELECT id, issue_id, started_at, finished_at, status, git_branch, git_sha, model, total_cost, total_tokens, schema_version
                       FROM runs
                       WHERE search_vector @@ plainto_tsquery('english', $1)
                       ORDER BY started_at DESC
                       LIMIT 100`;
          queryParams = [q];
        } else {
          queryText = `SELECT id, issue_id, started_at, finished_at, status, git_branch, git_sha, model, total_cost, total_tokens, schema_version
                       FROM runs
                       ORDER BY started_at DESC
                       LIMIT 100`;
          queryParams = [];
        }

        const { rows } = await db.query<RunRow>(queryText, queryParams);
        const runs = rows.map(r => ({
          id: r.id,
          issueId: r.issue_id,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          status: r.status,
          gitBranch: r.git_branch,
          gitSha: r.git_sha,
          model: r.model,
          totalCost: r.total_cost,
          totalTokens: r.total_tokens,
          schemaVersion: r.schema_version,
        }));
        return NextResponse.json(runs, { status: 200 });
      }
    } catch (err) {
      console.error('[api/runs] DB query failed, falling back to JSONL:', err);
    }
  }

  try {
    const runIds = await listRunIds();

    if (runIds.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    const allEvents = await readRunEventsAll(runIds);
    let runs: Run[] = runIds.map((runId, i) => buildRunFromEvents(runId, allEvents[i]));

    runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

    if (q) {
      const lower = q.toLowerCase();
      runs = runs.filter(r =>
        r.issueId?.toLowerCase().includes(lower) ||
        r.status?.toLowerCase().includes(lower)
      );
    }

    return NextResponse.json(runs, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
