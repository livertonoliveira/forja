import { notFound } from 'next/navigation';
import { compareRuns } from '@/lib/forja-store';
import { formatMs } from '@/lib/format';
import { gateDisplay } from '@/lib/ui-constants';
import { Card, CardContent } from '@/components/ui/card';
import { FindingDiffTable } from '@/components/runs/FindingDiffTable';
import { CopyLinkButton } from '@/components/runs/CopyLinkButton';
import { ExportJsonButton } from '@/components/runs/ExportJsonButton';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_IDS = 2;
const MAX_IDS = 5;

interface ComparePageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const idsParam = searchParams.ids ? String(searchParams.ids) : '';
  const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);

  const isInvalid =
    ids.length < MIN_IDS ||
    ids.length > MAX_IDS ||
    new Set(ids).size !== ids.length ||
    !ids.every(id => UUID_RE.test(id));

  if (isInvalid) notFound();

  const result = await compareRuns(ids);
  const { runs, crossProject, costDiff, durationDiff } = result;

  const oldestGate = runs[0]?.gate;
  const newestGate = runs[runs.length - 1]?.gate;

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-forja-text-primary">Comparação de Runs</h1>
          <p className="text-sm text-forja-text-muted mt-1">{runs.length} runs comparados</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <CopyLinkButton />
          <ExportJsonButton data={result} />
        </div>
      </div>

      {crossProject && (
        <Card className="border-amber-400 mb-6">
          <CardContent className="py-3 px-4">
            <p className="text-sm text-amber-700">
              ⚠ Estes runs pertencem a projetos diferentes. A comparação prossegue normalmente,
              mas os resultados podem refletir diferenças de contexto entre projetos.
            </p>
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted uppercase tracking-wider mb-2">Variação de custo</p>
          <p className={`text-lg font-semibold ${costDiff > 0 ? 'text-red-600' : costDiff < 0 ? 'text-green-600' : 'text-forja-text-secondary'}`}>
            {costDiff > 0 ? '+' : ''}{costDiff.toFixed(4)}
            <span className="text-xs font-normal ml-1 text-forja-text-muted">USD</span>
          </p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted uppercase tracking-wider mb-2">Variação de duração</p>
          <p className={`text-lg font-semibold ${durationDiff !== null && durationDiff > 0 ? 'text-red-600' : durationDiff !== null && durationDiff < 0 ? 'text-green-600' : 'text-forja-text-secondary'}`}>
            {durationDiff !== null
              ? `${durationDiff > 0 ? '+' : durationDiff < 0 ? '-' : ''}${formatMs(Math.abs(durationDiff))}`
              : '—'}
          </p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted uppercase tracking-wider mb-2">Gate (mais antigo)</p>
          <p className={`text-lg font-semibold ${oldestGate ? gateDisplay[oldestGate]?.cls : 'text-forja-text-muted'}`}>
            {oldestGate ? gateDisplay[oldestGate]?.label : '—'}
          </p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted uppercase tracking-wider mb-2">Gate (mais novo)</p>
          <p className={`text-lg font-semibold ${newestGate ? gateDisplay[newestGate]?.cls : 'text-forja-text-muted'}`}>
            {newestGate ? gateDisplay[newestGate]?.label : '—'}
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xs font-semibold text-forja-text-secondary uppercase tracking-wider mb-3">
          Runs comparados
        </h2>
        <div className="flex flex-wrap gap-2">
          {runs.map((run, i) => (
            <div
              key={run.id}
              className="bg-forja-bg-surface border border-forja-border-subtle rounded px-3 py-2 text-xs flex items-center gap-2"
            >
              <span className="text-forja-text-muted">#{i + 1}</span>
              <span className="font-mono text-forja-text-gold">{run.id.slice(0, 8)}…</span>
              {run.issueId && (
                <span className="text-forja-text-secondary font-mono">{run.issueId}</span>
              )}
              {run.gate && (
                <span className={`font-medium ${gateDisplay[run.gate]?.cls ?? 'text-forja-text-muted'}`}>
                  {gateDisplay[run.gate]?.label}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        <details open>
          <summary className="cursor-pointer select-none py-3 px-4 bg-forja-bg-surface border border-forja-gate-fail-border rounded-lg text-sm font-semibold text-forja-gate-fail-text hover:bg-forja-bg-elevated transition-colors list-none">
            Novos ({result.new.length})
          </summary>
          <div className="mt-2 pb-2">
            <FindingDiffTable findings={result.new} variant="new" />
          </div>
        </details>

        <details>
          <summary className="cursor-pointer select-none py-3 px-4 bg-forja-bg-surface border border-forja-gate-pass-border rounded-lg text-sm font-semibold text-forja-gate-pass-text hover:bg-forja-bg-elevated transition-colors list-none">
            Resolvidos ({result.resolved.length})
          </summary>
          <div className="mt-2 pb-2">
            <FindingDiffTable findings={result.resolved} variant="resolved" />
          </div>
        </details>

        <details>
          <summary className="cursor-pointer select-none py-3 px-4 bg-forja-bg-surface border border-forja-border-default rounded-lg text-sm font-semibold text-forja-text-secondary hover:bg-forja-bg-elevated transition-colors list-none">
            Persistentes ({result.persistent.length})
          </summary>
          <div className="mt-2 pb-2">
            <FindingDiffTable findings={result.persistent} variant="persistent" />
          </div>
        </details>
      </div>
    </div>
  );
}
