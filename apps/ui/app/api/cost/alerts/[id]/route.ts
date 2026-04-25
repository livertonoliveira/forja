import { NextResponse } from 'next/server';
import { readAlertsFile, writeAlertsFile } from '../_store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id format' }, { status: 400 });
  }

  try {
    const data = await readAlertsFile();
    const before = data.alerts.length;
    data.alerts = data.alerts.filter((a) => a.id !== id);

    if (data.alerts.length === before) {
      return NextResponse.json({ error: 'alert not found' }, { status: 404 });
    }

    await writeAlertsFile(data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
