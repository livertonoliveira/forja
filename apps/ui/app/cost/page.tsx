import { listRunIds, readRunEventsAll } from '@/lib/jsonl-reader';

export const dynamic = 'force-dynamic';

interface RunRow {
  id: string;
  issueId: string;
  startedAt: string;
  totalCost: number;
  priciestPhase: string;
}

function safeStr(value: unknown, maxLen = 64): string {
  if (typeof value !== 'string') return 'unknown';
  return value.slice(0, maxLen);
}

function priciestKey(record: Record<string, number>): string {
  return Object.entries(record).reduce(
    (best, [k, v]) => (v > best[1] ? [k, v] : best),
    ['—', -1]
  )[0];
}

function BarChart({ entries, max }: { entries: [string, number][]; max: number }) {
  return (
    <div className="space-y-2">
      {entries.map(([label, value]) => (
        <div key={label} className="flex items-center gap-3 text-sm">
          <span className="w-32 text-right text-gray-400 truncate shrink-0">{label}</span>
          <div className="flex-1 bg-gray-800 rounded-sm h-5 overflow-hidden">
            <div
              className="h-full bg-blue-600"
              style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
            />
          </div>
          <span className="w-24 text-right text-gray-300 font-mono shrink-0">
            ${value.toFixed(4)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function CostPage() {
  const runIds = await listRunIds();

  let totalRaw = 0;
  const byModelRaw: Record<string, number> = {};
  const byPhaseRaw: Record<string, number> = {};
  const runRows: RunRow[] = [];

  if (runIds.length > 0) {
    const allEvents = await readRunEventsAll(runIds);

    for (const [runId, events] of runIds.map((id, i) => [id, allEvents[i]] as const)) {
      const runStart = events.find((e) => e.eventType === 'run_start');
      const issueId = safeStr(runStart?.payload?.issueId) === 'unknown'
        ? '—'
        : safeStr(runStart?.payload?.issueId);
      const startedAt = runStart?.ts ?? '';

      let runTotal = 0;
      const perPhase: Record<string, number> = {};

      for (const event of events) {
        if (event.eventType !== 'cost') continue;
        const cost = Number(event.payload?.costUsd ?? 0);
        if (isNaN(cost)) continue;

        runTotal += cost;
        totalRaw += cost;

        const model = safeStr(event.payload?.model);
        byModelRaw[model] = (byModelRaw[model] ?? 0) + cost;

        const phase = safeStr(event.payload?.phase) !== 'unknown'
          ? safeStr(event.payload?.phase)
          : safeStr(event.phaseId);
        byPhaseRaw[phase] = (byPhaseRaw[phase] ?? 0) + cost;
        perPhase[phase] = (perPhase[phase] ?? 0) + cost;
      }

      runRows.push({
        id: runId,
        issueId,
        startedAt,
        totalCost: runTotal,
        priciestPhase: priciestKey(perPhase),
      });
    }
  }

  const topRuns = runRows.sort((a, b) => b.totalCost - a.totalCost).slice(0, 10);
  const modelEntries = Object.entries(byModelRaw).sort((a, b) => b[1] - a[1]);
  const phaseEntries = Object.entries(byPhaseRaw).sort((a, b) => b[1] - a[1]);
  const maxModel = modelEntries[0]?.[1] ?? 1;
  const maxPhase = phaseEntries[0]?.[1] ?? 1;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-gray-100 mb-2">Cost Dashboard</h1>
        <p className="text-gray-500 text-sm">Accumulated cost across all Forja runs</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg px-6 py-5 inline-block">
        <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">Total Accumulated Cost</p>
        <p className="text-3xl font-mono font-semibold text-green-400">
          ${totalRaw.toFixed(4)}
        </p>
        <p className="text-gray-600 text-xs mt-1">{runRows.length} run{runRows.length !== 1 ? 's' : ''} tracked</p>
      </div>

      <div>
        <h2 className="text-base font-medium text-gray-200 mb-4">Top 10 Most Expensive Runs</h2>
        {topRuns.length === 0 ? (
          <p className="text-gray-500 text-sm">No runs yet. Start a pipeline with <code className="text-gray-300">forja run</code>.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="pb-3 pr-6 font-medium">Run ID</th>
                  <th className="pb-3 pr-6 font-medium">Issue</th>
                  <th className="pb-3 pr-6 font-medium">Date</th>
                  <th className="pb-3 pr-6 font-medium">Cost (USD)</th>
                  <th className="pb-3 font-medium">Priciest Phase</th>
                </tr>
              </thead>
              <tbody>
                {topRuns.map((run) => (
                  <tr key={run.id} className="border-b border-gray-900 hover:bg-gray-900/50 transition-colors">
                    <td className="py-3 pr-6 font-mono text-gray-400 text-xs">
                      {run.id.slice(0, 8)}&hellip;
                    </td>
                    <td className="py-3 pr-6 font-mono text-gray-300">{run.issueId}</td>
                    <td className="py-3 pr-6 text-gray-500 text-xs">
                      {run.startedAt ? new Date(run.startedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 pr-6 text-gray-200 font-mono">${run.totalCost.toFixed(4)}</td>
                    <td className="py-3 text-gray-400">{run.priciestPhase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-base font-medium text-gray-200 mb-4">Cost by Model</h2>
        {modelEntries.length === 0 ? (
          <p className="text-gray-500 text-sm">No model cost data available.</p>
        ) : (
          <BarChart entries={modelEntries} max={maxModel} />
        )}
      </div>

      <div>
        <h2 className="text-base font-medium text-gray-200 mb-4">Cost by Phase</h2>
        {phaseEntries.length === 0 ? (
          <p className="text-gray-500 text-sm">No phase cost data available.</p>
        ) : (
          <BarChart entries={phaseEntries} max={maxPhase} />
        )}
      </div>
    </div>
  );
}
