import { NextResponse } from 'next/server';
import { getFinding } from '@/lib/forja-store';
import { UUID_RE } from '@/lib/validation';

export async function GET(
  _req: Request,
  { params }: { params: { findingId: string } },
): Promise<NextResponse> {
  const { findingId } = params;

  if (!UUID_RE.test(findingId)) {
    return NextResponse.json({ error: 'invalid findingId' }, { status: 400 });
  }

  try {
    const finding = await getFinding(findingId);
    if (!finding) {
      return NextResponse.json({ error: 'finding not found' }, { status: 404 });
    }
    return NextResponse.json(finding, {
      status: 200,
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[api/findings/findingId]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
