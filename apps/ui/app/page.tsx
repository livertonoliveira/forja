import { getTranslations } from 'next-intl/server';
import { listRecentRuns } from '@/lib/forja-store';
import { typography } from '@/lib/typography';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export const dynamic = 'force-dynamic';
import { statusColors, gateTextColors } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';
import { EmptyRuns } from '@/components/shell/EmptyState';

export default async function HomePage() {
  const runs = await listRecentRuns(10);
  const t = await getTranslations('runs');

  return (
    <div>
      <h1 className={`${typography.heading.lg} text-forja-text-primary mb-6`}>{t('recent')}</h1>
      {runs.length === 0 ? (
        <EmptyRuns />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.issue')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.duration')}</TableHead>
              <TableHead>{t('columns.cost')}</TableHead>
              <TableHead>{t('columns.gate')}</TableHead>
              <TableHead>{t('columns.start')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run, index) => (
              <TableRow
                key={run.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
              >
                <TableCell className={typography.mono.md}>{run.issueId}</TableCell>
                <TableCell>
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-forja-bg-overlay text-forja-text-muted'}`}>
                    {run.status}
                  </span>
                </TableCell>
                <TableCell className="text-forja-text-secondary">{formatDuration(run.startedAt, run.finishedAt)}</TableCell>
                <TableCell className="text-forja-text-secondary">${run.totalCost}</TableCell>
                <TableCell className={`font-medium ${run.gate ? gateTextColors[run.gate] : 'text-forja-text-muted'}`}>
                  {run.gate ?? '—'}
                </TableCell>
                <TableCell className={typography.body.sm + ' text-forja-text-muted'}>
                  {new Date(run.startedAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
