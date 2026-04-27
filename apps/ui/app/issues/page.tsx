import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { gateBadgeColors } from '@/lib/ui-constants';

export const dynamic = 'force-dynamic';

interface IssueSummary {
  issueId: string;
  runCount: number;
  lastGate: 'pass' | 'warn' | 'fail' | null;
  lastRun: string;
}

export default async function IssuesPage() {
  const res = await fetch('http://localhost:4242/api/issues', { next: { revalidate: 30 } });
  const issues: IssueSummary[] = res.ok ? await res.json() : [];
  const t = await getTranslations('issues');

  return (
    <div>
      <h1 className="text-xl font-semibold text-forja-text-primary mb-6">{t('title')}</h1>
      {issues.length === 0 ? (
        <p className="text-forja-text-secondary text-sm">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forja-text-secondary border-b border-forja-border-default">
                <th className="pb-3 pr-6 font-medium">{t('columns.issue')}</th>
                <th className="pb-3 pr-6 font-medium">{t('columns.runs')}</th>
                <th className="pb-3 pr-6 font-medium">{t('columns.last_gate')}</th>
                <th className="pb-3 font-medium">{t('columns.last_run')}</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.issueId} className="border-b border-forja-border-subtle hover:bg-forja-bg-surface transition-colors">
                  <td className="py-3 pr-6 font-mono text-forja-text-primary font-medium">
                    <Link href={`/issues/${issue.issueId}`} className="hover:text-forja-text-gold transition-colors">
                      {issue.issueId}
                    </Link>
                  </td>
                  <td className="py-3 pr-6 text-forja-text-secondary">{issue.runCount}</td>
                  <td className="py-3 pr-6">
                    {issue.lastGate ? (
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${gateBadgeColors[issue.lastGate]}`}>
                        {issue.lastGate}
                      </span>
                    ) : (
                      <span className="text-forja-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-3 text-forja-text-muted text-xs">
                    {new Date(issue.lastRun).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
