import lazyLoad from 'next/dynamic';
import { listRuns, type RunFilters } from '@/lib/forja-store';
import { FilterBar } from '@/components/filters/FilterBar';
import { Skeleton } from '@/components/ui/skeleton';
import { RunsTableWithSelection } from '@/components/runs/RunsTableWithSelection';
import { EmptyRuns, EmptyFilters, EmptySearch } from '@/components/shell/EmptyState';
import { StaggeredReveal } from '@/components/shell/StaggeredReveal';

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
  const hasFilters = Boolean(filters.q || filters.from || filters.to || filters.gate?.length);

  return (
    <div>
      <h1 className="text-xl font-semibold text-forja-text-primary mb-6">Execuções</h1>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-forja-text-secondary uppercase tracking-wider mb-4">Tendências</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StaggeredReveal>
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
          </StaggeredReveal>
        </div>
      </section>

      <FilterBar />
      {runs.length === 0 ? (
        filters.q ? (
          <EmptySearch query={String(filters.q)} />
        ) : hasFilters ? (
          <EmptyFilters clearHref="/runs" />
        ) : (
          <EmptyRuns />
        )
      ) : (
        <RunsTableWithSelection runs={runs} />
      )}
    </div>
  );
}
