import { listRecentRuns } from '@/lib/forja-store';
import { typography } from '@/lib/typography';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export const dynamic = 'force-dynamic';
import { statusColors, gateTextColors } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';

export default async function HomePage() {
  const runs = await listRecentRuns(10);

  return (
    <div>
      <h1 className={`${typography.heading.lg} text-forja-text-primary mb-6`}>Execuções Recentes</h1>
      {runs.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhuma execução ainda. Inicie um pipeline com <code className="text-gray-300">forja run</code>.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarefa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Custo</TableHead>
              <TableHead>Gate</TableHead>
              <TableHead>Início</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
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
                  {new Date(run.startedAt).toLocaleString('pt-BR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
