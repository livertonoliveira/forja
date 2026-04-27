import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPool } from '@/lib/db';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const cookieStore = cookies();
  if (cookieStore.get('forja-role')?.value !== 'admin') {
    return NextResponse.json({ error: 'Forbidden. Admin role required.' }, { status: 403 });
  }

  const { id } = params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const pool = await getPool();
  if (!pool) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });
  }

  try {
    await pool.query(
      `UPDATE hook_dlq SET status = 'dead', attempts = 0, last_attempt_at = NULL WHERE id = $1`,
      [id]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dlq] POST /api/dlq/[id]/reprocess failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
