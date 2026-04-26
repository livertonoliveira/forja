import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';

export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limitParam = searchParams.get('limit');
    const parsedLimit = parseInt(limitParam ?? '', 10);
    const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(200, Math.max(1, parsedLimit));
    const offsetParam = searchParams.get('offset');
    const parsedOffset = parseInt(offsetParam ?? '', 10);
    const offset = Number.isNaN(parsedOffset) ? 0 : Math.max(0, parsedOffset);

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ events: [], total: 0, limit, offset }, { status: 200 });
    }

    const VALID_STATUSES = new Set(['dead', 'reprocessed', 'ignored']);
    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }

    const params: unknown[] = [];
    let whereClause = '';
    if (status) {
      params.push(status);
      whereClause = `WHERE status = $${params.length}`;
    }

    const [eventsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, hook_type, payload, error_message, attempts, last_attempt_at, created_at, status
         FROM hook_dlq ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM hook_dlq ${whereClause}`,
        params
      ),
    ]);

    const events = eventsResult.rows.map((r) => ({
      id: r.id,
      hookType: r.hook_type,
      payload: r.payload,
      errorMessage: r.error_message,
      attempts: r.attempts,
      lastAttemptAt: r.last_attempt_at,
      createdAt: r.created_at,
      status: r.status,
    }));

    return NextResponse.json({
      events,
      total: countResult.rows[0]?.total ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[dlq] GET /api/dlq failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
