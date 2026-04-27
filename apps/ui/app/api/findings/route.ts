import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listRunIds, readRunEvents } from '@/lib/jsonl-reader';
import { parseFindings } from '@/lib/findings-parser';
import type { Finding } from '@/lib/types';

const MOCK_FINDINGS = {
  critical: [
    { id: 'f-001', severity: 'critical' as const, category: 'security', message: 'SQL injection potencial em query dinâmica', file: 'src/db/queries.ts', runId: 'run-007', phase: 'security' },
  ],
  high: [
    { id: 'f-002', severity: 'high' as const, category: 'performance', message: 'N+1 query detectado em listagem de issues', file: 'src/api/issues.ts', runId: 'run-002', phase: 'perf' },
    { id: 'f-003', severity: 'high' as const, category: 'security', message: 'Token exposto em variável de ambiente sem validação', file: 'src/config.ts', runId: 'run-007', phase: 'security' },
  ],
  medium: [
    { id: 'f-004', severity: 'medium' as const, category: 'quality', message: 'Função com complexidade ciclomática > 10', file: 'src/pipeline/runner.ts', runId: 'run-002', phase: 'review' },
    { id: 'f-005', severity: 'medium' as const, category: 'performance', message: 'Bundle size acima do limite configurado', file: 'apps/ui/app/layout.tsx', runId: 'run-004', phase: 'perf' },
  ],
  low: [
    { id: 'f-006', severity: 'low' as const, category: 'quality', message: 'Variável não utilizada detectada', file: 'src/cli/index.ts', runId: 'run-001', phase: 'review' },
    { id: 'f-007', severity: 'low' as const, category: 'quality', message: 'Comentário TODO sem ticket associado', file: 'src/workers/queue.ts', runId: 'run-003', phase: 'review' },
    { id: 'f-008', severity: 'low' as const, category: 'security', message: 'Header de segurança ausente (X-Frame-Options)', file: 'apps/ui/next.config.js', runId: 'run-001', phase: 'security' },
  ],
  total: 8,
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filterRunId = url.searchParams.get('runId');
    const q = url.searchParams.get('q')?.slice(0, 200) ?? null;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10))) : null;

    const allRunIds = await listRunIds();

    if (allRunIds.length === 0) {
      // Handle search against mock data
      if (q !== null) {
        const lower = q.toLowerCase();
        const allMock: Finding[] = [
          ...MOCK_FINDINGS.critical,
          ...MOCK_FINDINGS.high,
          ...MOCK_FINDINGS.medium,
          ...MOCK_FINDINGS.low,
        ].filter(f =>
          f.message.toLowerCase().includes(lower) ||
          (f.file !== null && f.file.toLowerCase().includes(lower))
        );
        const results = limit !== null ? allMock.slice(0, limit) : allMock;
        return NextResponse.json(results, { status: 200 });
      }
      return NextResponse.json(MOCK_FINDINGS, { status: 200 });
    }

    const runIds = filterRunId ? allRunIds.filter((id) => id === filterRunId) : allRunIds;

    const grouped: Record<'critical' | 'high' | 'medium' | 'low', Finding[]> = {
      critical: [],
      high: [],
      medium: [],
      low: [],
    };

    for (const runId of runIds) {
      const events = await readRunEvents(runId);
      for (const finding of parseFindings(runId, events)) {
        grouped[finding.severity].push(finding);
      }
    }

    // If ?q= param provided, return flat filtered array
    if (q !== null) {
      const lower = q.toLowerCase();
      const all: Finding[] = [
        ...grouped.critical,
        ...grouped.high,
        ...grouped.medium,
        ...grouped.low,
      ].filter(f =>
        f.message.toLowerCase().includes(lower) ||
        (f.file !== null && f.file.toLowerCase().includes(lower))
      );
      const results = limit !== null ? all.slice(0, limit) : all;
      return NextResponse.json(results, { status: 200 });
    }

    const total = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    return NextResponse.json({ ...grouped, total });
  } catch {
    return NextResponse.json(MOCK_FINDINGS, { status: 200 });
  }
}
