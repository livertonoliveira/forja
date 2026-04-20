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
      <h1 className="text-xl font-semibold text-gray-100 mb-6">Runs</h1>
      {runs.length === 0 ? (
        <p className="text-gray-500 text-sm">
          Nenhum run encontrado. Inicie um pipeline com{' '}
          <code className="text-gray-300">forja run</code>.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-3 pr-6 font-medium">Run ID</th>
                <th className="pb-3 pr-6 font-medium">Issue</th>
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
                  <tr key={run.id} className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors">
                    <td className="py-3 pr-6">
                      <Link
                        href={`/runs/${run.id}`}
                        className="font-mono text-blue-400 hover:text-blue-300 text-xs transition-colors"
                      >
                        {run.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="py-3 pr-6 font-mono text-gray-300">{run.issueId || '—'}</td>
                    <td className="py-3 pr-6">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-800 text-gray-400'}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-gray-500 text-xs">
                      {new Date(run.startedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 pr-6 text-gray-400">{formatDuration(run.startedAt, run.finishedAt)}</td>
                    <td className="py-3 pr-6 text-gray-400">${run.totalCostUsd}</td>
                    <td className={`py-3 font-medium ${gd ? gd.cls : 'text-gray-600'}`}>
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
