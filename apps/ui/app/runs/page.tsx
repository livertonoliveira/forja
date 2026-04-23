import Link from 'next/link';
import { listRunIds, readRunSummaryEventsAll, buildRunFromEvents } from '@/lib/jsonl-reader';
import { statusColors, gateDisplay } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';
import type { Run } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RunsPage() {
  const runIds = await listRunIds();
  const allEvents = await readRunSummaryEventsAll(runIds);
  const runs: Run[] = runIds.map((id, i) => buildRunFromEvents(id, allEvents[i]));
  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  return (
    <div>
      <h1 className="text-xl font-semibold text-forja-text-primary mb-6">Execuções</h1>
      {runs.length === 0 ? (
        <p className="text-forja-text-secondary text-sm">
          Nenhuma execução encontrada. Inicie um pipeline com{' '}
          <code className="text-forja-text-primary font-mono">forja run</code>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-forja-text-secondary border-b border-forja-border-default">
                <th className="pb-3 pr-6 font-medium">Run ID</th>
                <th className="pb-3 pr-6 font-medium">Tarefa</th>
                <th className="pb-3 pr-6 font-medium">Status</th>
                <th className="pb-3 pr-6 font-medium">Início</th>
                <th className="pb-3 pr-6 font-medium">Duração</th>
                <th className="pb-3 pr-6 font-medium">Custo</th>
                <th className="pb-3 font-medium">Gate</th>
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
                      {new Date(run.startedAt).toLocaleString('pt-BR')}
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
