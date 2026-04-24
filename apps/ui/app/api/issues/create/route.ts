import { NextResponse } from 'next/server';
import { UUID_RE } from '@/lib/validation';

type Provider = 'linear' | 'jira' | 'gitlab';

interface CreateIssueBody {
  provider: Provider;
  title: string;
  description: string;
  findingId: string;
}

function generateUrl(provider: Provider): string {
  if (provider === 'linear') {
    const num = Math.floor(Math.random() * 9000) + 1000;
    return `https://linear.app/mobitech/issue/MOB-${num}`;
  }
  if (provider === 'jira') {
    const num = Math.floor(Math.random() * 900) + 100;
    return `https://jira.example.com/browse/PROJ-${num}`;
  }
  const num = Math.floor(Math.random() * 900) + 100;
  return `https://gitlab.com/group/project/-/issues/${num}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: Partial<CreateIssueBody>;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  try {
    const { provider, title, description, findingId } = body;

    if (!provider || !title || !description || !findingId) {
      return NextResponse.json({ error: 'provider, title, description and findingId are required' }, { status: 400 });
    }

    if (!['linear', 'jira', 'gitlab'].includes(provider)) {
      return NextResponse.json({ error: 'invalid provider' }, { status: 400 });
    }

    if (!UUID_RE.test(findingId)) {
      return NextResponse.json({ error: 'invalid findingId' }, { status: 400 });
    }

    const url = generateUrl(provider);

    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    console.error('[api/issues/create]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
