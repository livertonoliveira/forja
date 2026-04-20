import { listRecentRuns } from '@/lib/forja-store';
import { statusColors, gateTextColors } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';

export default async function HomePage() {
  const runs = await listRecentRuns(10);

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-100 mb-6">Recent Runs</h1>
      {runs.length === 0 ? (
        <p className="text-gray-500 text-sm">No runs yet. Start a pipeline with <code className="text-gray-300">forja run</code>.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-3 pr-6 font-medium">Issue</th>
                <th className="pb-3 pr-6 font-medium">Status</th>
                <th className="pb-3 pr-6 font-medium">Duration</th>
                <th className="pb-3 pr-6 font-medium">Cost</th>
                <th className="pb-3 pr-6 font-medium">Gate</th>
                <th className="pb-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-6 font-mono text-gray-300">{run.issueId}</td>
                  <td className="py-3 pr-6">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[run.status] ?? 'bg-gray-800 text-gray-400'}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-gray-400">{formatDuration(run.startedAt, run.finishedAt)}</td>
                  <td className="py-3 pr-6 text-gray-400">${run.totalCost}</td>
                  <td className={`py-3 pr-6 font-medium ${run.gate ? gateTextColors[run.gate] : 'text-gray-600'}`}>
                    {run.gate ?? '—'}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">
                    {new Date(run.startedAt).toLocaleString('pt-BR')}
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
