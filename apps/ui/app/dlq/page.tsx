import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { statusColors, gateDisplay } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';
import type { Run } from '@/lib/types';
import { EmptyDLQ } from '@/components/shell/EmptyState';

export const dynamic = 'force-dynamic';

async function getFailedRuns(): Promise<Run[]> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:4242';
    const res = await fetch(`${base}/api/runs`, { cache: 'no-store' });
    if (!res.ok) return [];
    const runs: Run[] = await res.json();
    return runs.filter((r) => r.status === 'failed' || r.gateFinal === 'fail');
  } catch {
    return [];
  }
}

export default async function DLQPage() {
  const runs = await getFailedRuns();
  const t = await getTranslations('dlq');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-forja-text-primary">{t('title')}</h1>
        <p className="text-forja-text-secondary text-sm mt-1">
          {t('desc')} ({runs.length} {runs.length !== 1 ? t('pending_other') : t('pending_one')})
        </p>
      </div>

      {runs.length === 0 ? (
        <EmptyDLQ />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forja-text-secondary border-b border-forja-border-default">
                <th className="pb-3 pr-6 font-medium">{t('columns.run_id')}</th>
                <th className="pb-3 pr-6 font-medium">{t('columns.issue')}</th>
                <th className="pb-3 pr-6 font-medium">{t('columns.status')}</th>
                <th className="pb-3 pr-6 font-medium">{t('columns.start')}</th>
                <th className="pb-3 pr-6 font-medium">{t('columns.duration')}</th>
                <th className="pb-3 pr-6 font-medium">{t('columns.cost')}</th>
                <th className="pb-3 font-medium">{t('columns.gate')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const gate = run.gateFinal;
                const gd = gate ? gateDisplay[gate] : null;
                return (
                  <tr key={run.id} className="border-b border-forja-border-subtle hover:bg-forja-bg-surface transition-colors">
                    <td className="py-3 pr-6">
                      <Link
                        href={`/runs/${run.id}`}
                        className="font-mono text-forja-text-gold hover:text-forja-text-gold/80 text-xs transition-colors"
                      >
                        {run.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="py-3 pr-6 font-mono text-forja-text-primary">{run.issueId || '—'}</td>
                    <td className="py-3 pr-6">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-forja-text-muted text-xs">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-6 text-forja-text-secondary">{formatDuration(run.startedAt, run.finishedAt)}</td>
                    <td className="py-3 pr-6 text-forja-text-secondary">${run.totalCostUsd}</td>
                    <td className={`py-3 font-medium ${gd ? gd.cls : 'text-forja-text-muted'}`}>
                      {gd ? gd.label : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
