import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Run } from '@/lib/types';

export const dynamic = 'force-dynamic';
import RegressionBadge from '@/components/RegressionBadge';
import { statusColors, gateTextColors } from '@/lib/ui-constants';

const gateWeight: Record<string, number> = { fail: 0, warn: 1, pass: 2 };

function isRegression(current: Run['gateFinal'], previous: Run['gateFinal']): boolean {
  if (current === null || previous === null) return false;
  return gateWeight[current] < gateWeight[previous];
}

export default async function IssueDetailPage({
  params,
}: {
  params: { issueId: string };
}) {
  const { issueId } = params;

  if (!/^[A-Za-z]+-\d+$/.test(issueId)) {
    notFound();
  }

  const res = await fetch(`http://localhost:4242/api/issues/${issueId}`, {
    cache: 'no-store',
  });

  const newestFirst: Run[] = res.ok ? await res.json() : [];
  const runs = [...newestFirst].reverse();
  const t = await getTranslations('issues');
  const tRuns = await getTranslations('runs');

  return (
    <div>
      <div className="mb-6">
        <Link href="/issues" className="text-sm text-forja-text-secondary hover:text-forja-text-primary transition-colors">
          {t('back')}
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-forja-text-primary">{t('title')}</h1>
        <a
          href={`https://linear.app/mobitech/issue/${issueId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-forja-text-gold hover:text-forja-text-gold/80 transition-colors"
        >
          {issueId}
        </a>
      </div>
      {runs.length === 0 ? (
        <p className="text-forja-text-secondary text-sm">{t('no_runs')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forja-text-secondary border-b border-forja-border-default">
                <th className="pb-3 pr-6 font-medium">{tRuns('columns.number')}</th>
                <th className="pb-3 pr-6 font-medium">{tRuns('columns.start')}</th>
                <th className="pb-3 pr-6 font-medium">{tRuns('columns.status')}</th>
                <th className="pb-3 pr-6 font-medium">{tRuns('columns.cost')}</th>
                <th className="pb-3 pr-6 font-medium">{tRuns('columns.gate')}</th>
                <th className="pb-3 font-medium">{tRuns('columns.regression')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, index) => {
                const previous = index > 0 ? runs[index - 1] : null;
                const regression = previous !== null && isRegression(run.gateFinal, previous.gateFinal);

                return (
                  <tr key={run.id} className="border-b border-forja-border-subtle hover:bg-forja-bg-surface transition-colors">
                    <td className="py-3 pr-6 text-forja-text-muted">{index + 1}</td>
                    <td className="py-3 pr-6 text-forja-text-muted text-xs">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-6">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-forja-text-secondary">
                      ${parseFloat(run.totalCostUsd).toFixed(4)}
                    </td>
                    <td className={`py-3 pr-6 font-medium ${run.gateFinal ? gateTextColors[run.gateFinal] : 'text-forja-text-muted'}`}>
                      {run.gateFinal ?? '—'}
                    </td>
                    <td className="py-3">
                      {regression && <RegressionBadge />}
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
