import { notFound } from 'next/navigation';
import Link from 'next/link';
import { listRunIds, readRunEvents, buildRunFromEvents, buildPhasesFromEvents } from '@/lib/jsonl-reader';
import { statusColors, gateTextColors } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';
import RunGantt from '@/components/RunGantt';

export const dynamic = 'force-dynamic';

interface Props {
  params: { runId: string };
}

export default async function RunDetailPage({ params }: Props) {
  const { runId } = params;
  const allIds = await listRunIds();
  if (!allIds.includes(runId)) notFound();

  const events = await readRunEvents(runId);
  const run = buildRunFromEvents(runId, events);
  const phases = buildPhasesFromEvents(events);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/runs" className="text-forja-text-secondary hover:text-forja-text-primary transition-colors">
          ← Execuções
        </Link>
        <span className="text-forja-text-muted">/</span>
        <span className="font-mono text-forja-text-muted text-xs">{runId}</span>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">Tarefa</p>
          <p className="font-mono text-forja-text-primary text-sm">{run.issueId || '—'}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">Status</p>
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {run.status}
          </span>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">Duração</p>
          <p className="text-forja-text-primary text-sm">{formatDuration(run.startedAt, run.finishedAt, 'Em andamento')}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">Gate final</p>
          <p className={`text-sm font-semibold ${run.gateFinal ? gateTextColors[run.gateFinal] : 'text-forja-text-muted'}`}>
            {run.gateFinal ?? '—'}
          </p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">Custo total</p>
          <p className="text-forja-text-primary text-sm">${run.totalCostUsd}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">Tokens totais</p>
          <p className="text-forja-text-primary text-sm">{run.totalTokens.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4 col-span-2">
          <p className="text-xs text-forja-text-muted mb-1">Início</p>
          <p className="text-forja-text-primary text-sm">{new Date(run.startedAt).toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <h2 className="text-base font-semibold text-forja-text-primary mb-4">Fases</h2>
      <RunGantt phases={phases} />
    </div>
  );
}
