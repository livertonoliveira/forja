import { listRecentRuns } from '@/lib/forja-store';

const statusColors: Record<string, string> = {
  done: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
  dev: 'bg-blue-900 text-blue-300',
  test: 'bg-blue-900 text-blue-300',
  perf: 'bg-yellow-900 text-yellow-300',
  security: 'bg-yellow-900 text-yellow-300',
  review: 'bg-purple-900 text-purple-300',
  homolog: 'bg-purple-900 text-purple-300',
  pr: 'bg-indigo-900 text-indigo-300',
  spec: 'bg-gray-700 text-gray-300',
  init: 'bg-gray-700 text-gray-300',
};

const gateColors: Record<string, string> = {
  pass: 'text-green-400',
  warn: 'text-yellow-400',
  fail: 'text-red-400',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

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
                  <td className="py-3 pr-6 text-gray-400">{formatDuration(run.durationMs)}</td>
                  <td className="py-3 pr-6 text-gray-400">${run.totalCost}</td>
                  <td className={`py-3 pr-6 font-medium ${run.gate ? gateColors[run.gate] : 'text-gray-600'}`}>
                    {run.gate ?? '—'}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">
                    {new Date(run.startedAt).toLocaleString()}
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
