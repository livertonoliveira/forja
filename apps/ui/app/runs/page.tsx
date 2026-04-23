import Link from 'next/link';
import lazyLoad from 'next/dynamic';
import { listRuns, type RunFilters } from '@/lib/forja-store';
import { statusColors, gateDisplay } from '@/lib/ui-constants';
import { formatDuration } from '@/lib/format';
import { FilterBar } from '@/components/filters/FilterBar';
import { Skeleton } from '@/components/ui/skeleton';

const TrendChart = lazyLoad(() => import('@/components/charts/TrendChart').then(m => m.TrendChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />,
});

const GateFunnelChart = lazyLoad(() => import('@/components/charts/GateFunnelChart').then(m => m.GateFunnelChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[300px] w-full" />,
});

const FINDINGS_LINES = [
  { dataKey: 'critical', stroke: '#DC2626', name: 'Critical' },
  { dataKey: 'high', stroke: '#F97316', name: 'High' },
  { dataKey: 'medium', stroke: '#EAB308', name: 'Medium' },
  { dataKey: 'low', stroke: '#22C55E', name: 'Low' },
];

export const dynamic = 'force-dynamic';

const MAX_Q_LEN = 200;
const VALID_GATES = new Set(['pass', 'warn', 'fail']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RunsPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function RunsPage({ searchParams }: RunsPageProps) {
  const filters: RunFilters = {};

  if (searchParams.q) {
    const q = String(searchParams.q).slice(0, MAX_Q_LEN);
    if (q) filters.q = q;
  }
  if (searchParams.from) {
    const from = String(searchParams.from);
    if (ISO_DATE_RE.test(from)) filters.from = from;
  }
  if (searchParams.to) {
    const to = String(searchParams.to);
    if (ISO_DATE_RE.test(to)) filters.to = to;
  }
  if (searchParams.gate) {
    const raw = Array.isArray(searchParams.gate)
      ? searchParams.gate
      : String(searchParams.gate).split(',');
    const valid = raw.filter(g => VALID_GATES.has(g));
    if (valid.length > 0) filters.gate = valid;
  }

  const runs = await listRuns(filters);

  return (
    <div>
      <h1 className="text-xl font-semibold text-forja-text-primary mb-6">Execuções</h1>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-forja-text-secondary uppercase tracking-wider mb-4">Tendências</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
            <TrendChart
              metric="findings"
              lines={FINDINGS_LINES}
              title="Findings por Severidade"
            />
          </div>
          <div className="bg-forja-bg-surface border border-forja-border-subtle rounded-lg p-4">
            <GateFunnelChart title="Taxa de Gate" />
          </div>
        </div>
      </section>

      <FilterBar />
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
                const gd = run.gate ? gateDisplay[run.gate] : null;
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
                    <td className="py-3 pr-6 text-forja-text-secondary">${run.totalCost}</td>
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
