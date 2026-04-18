import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import { z } from 'zod';

const DUAL_WRITE_EVENTS = new Set(['finding', 'cost', 'gate', 'phase_start']);

export async function checkConsistency(
  runId: string,
): Promise<{ jsonlCount: number; pgCount: number; ok: boolean }> {
  z.string().uuid().parse(runId);

  const tracePath = path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
  const content = await fs.readFile(tracePath, { encoding: 'utf8' }).catch(() => '');
  const jsonlCount = content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => {
      try {
        const ev = JSON.parse(line) as { eventType?: string };
        return DUAL_WRITE_EVENTS.has(ev.eventType ?? '');
      } catch {
        return false;
      }
    }).length;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return { jsonlCount, pgCount: 0, ok: false };
  }

  const pool = new Pool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  });
  try {
    const { rows } = await pool.query<{ total: string }>(
      `SELECT (
        (SELECT COUNT(*) FROM findings WHERE run_id = $1) +
        (SELECT COUNT(*) FROM cost_events WHERE run_id = $1) +
        (SELECT COUNT(*) FROM gate_decisions WHERE run_id = $1) +
        (SELECT COUNT(*) FROM phases WHERE run_id = $1)
      ) AS total`,
      [runId],
    );
    const pgCount = Number(rows[0]?.total ?? 0);
    return { jsonlCount, pgCount, ok: jsonlCount === pgCount };
  } finally {
    await pool.end();
  }
}
