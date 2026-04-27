import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { listRunIds, readRunEvents, buildRunFromEvents, buildPhasesFromEvents } from '@/lib/jsonl-reader';
import { statusColors, gateTextColors } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';
import RunGantt from '@/components/RunGantt';
import { parseFindings } from '@/lib/findings-parser';
import { FindingsRunSection } from '@/components/findings/FindingsRunSection';

export const dynamic = 'force-dynamic';

interface Props {
  params: { runId: string };
  searchParams: { findingId?: string };
}

export default async function RunDetailPage({ params, searchParams }: Props) {
  const { runId } = params;
  const allIds = await listRunIds();
  if (!allIds.includes(runId)) notFound();

  const events = await readRunEvents(runId);
  const run = buildRunFromEvents(runId, events);
  const phases = buildPhasesFromEvents(events);
  const findings = parseFindings(runId, events);
  const initialFindingId = searchParams.findingId;
  const t = await getTranslations('runs');

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href="/runs" className="text-forja-text-secondary hover:text-forja-text-primary transition-colors">
          {t('back')}
        </Link>
        <span className="text-forja-text-muted">/</span>
        <span className="font-mono text-forja-text-muted text-xs">{runId}</span>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">{t('detail.task')}</p>
          <p className="font-mono text-forja-text-primary text-sm">{run.issueId || '—'}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">{t('detail.status')}</p>
          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {run.status}
          </span>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">{t('detail.duration')}</p>
          <p className="text-forja-text-primary text-sm">{formatDuration(run.startedAt, run.finishedAt, t('in_progress'))}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">{t('detail.final_gate')}</p>
          <p className={`text-sm font-semibold ${run.gateFinal ? gateTextColors[run.gateFinal] : 'text-forja-text-muted'}`}>
            {run.gateFinal ?? '—'}
          </p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">{t('detail.total_cost')}</p>
          <p className="text-forja-text-primary text-sm">${run.totalCostUsd}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
          <p className="text-xs text-forja-text-muted mb-1">{t('detail.total_tokens')}</p>
          <p className="text-forja-text-primary text-sm">{run.totalTokens.toLocaleString()}</p>
        </div>
        <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4 col-span-2">
          <p className="text-xs text-forja-text-muted mb-1">{t('detail.start')}</p>
          <p className="text-forja-text-primary text-sm">{new Date(run.startedAt).toLocaleString()}</p>
        </div>
      </div>

      <h2 className="text-base font-semibold text-forja-text-primary mb-4">{t('phases')}</h2>
      <RunGantt phases={phases} runStart={run.startedAt} runEnd={run.finishedAt} />

      <div className="mt-8">
        <FindingsRunSection
          findings={findings}
          runId={runId}
          initialFindingId={initialFindingId}
        />
      </div>
    </div>
  );
}
