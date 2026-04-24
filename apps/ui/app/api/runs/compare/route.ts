import { NextResponse } from 'next/server';
import { compareRuns } from '@/lib/forja-store';

const MIN_IDS = 2;
const MAX_IDS = 5;

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json({ error: 'ids query param is required' }, { status: 400 });
  }

  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);

  if (ids.length < MIN_IDS || ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `ids must have between ${MIN_IDS} and ${MAX_IDS} entries` },
      { status: 400 },
    );
  }

  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'ids must be unique' }, { status: 400 });
  }

  // Basic UUID format validation
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ids.every((id) => UUID_RE.test(id))) {
    return NextResponse.json({ error: 'all ids must be valid UUIDs' }, { status: 400 });
  }

  try {
    const result = await compareRuns(ids);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('[api/runs/compare]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
