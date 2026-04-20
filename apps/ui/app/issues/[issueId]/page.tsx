import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    next: { revalidate: 30 },
  });

  const newestFirst: Run[] = res.ok ? await res.json() : [];
  const runs = [...newestFirst].reverse();

  return (
    <div>
      <div className="mb-6">
        <Link href="/issues" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
          ← Issues
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-100">Issue</h1>
        <a
          href={`https://linear.app/mobitech/issue/${issueId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-blue-400 hover:text-blue-300 transition-colors"
        >
          {issueId}
        </a>
      </div>
      {runs.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhum run encontrado para esta issue.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-3 pr-6 font-medium">#</th>
                <th className="pb-3 pr-6 font-medium">Started</th>
                <th className="pb-3 pr-6 font-medium">Phases</th>
                <th className="pb-3 pr-6 font-medium">Cost</th>
                <th className="pb-3 pr-6 font-medium">Gate</th>
                <th className="pb-3 font-medium">Regression</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run, index) => {
                const previous = index > 0 ? runs[index - 1] : null;
                const regression = previous !== null && isRegression(run.gateFinal, previous.gateFinal);

                return (
                  <tr key={run.id} className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors">
                    <td className="py-3 pr-6 text-gray-400">{index + 1}</td>
                    <td className="py-3 pr-6 text-gray-500 text-xs">
                      {new Date(run.startedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 pr-6">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-800 text-gray-400'}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 pr-6 text-gray-400">
                      ${parseFloat(run.totalCostUsd).toFixed(4)}
                    </td>
                    <td className={`py-3 pr-6 font-medium ${run.gateFinal ? gateTextColors[run.gateFinal] : 'text-gray-600'}`}>
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
