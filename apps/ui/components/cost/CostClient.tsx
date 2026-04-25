'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import type { BreakdownRow, HeatmapCell } from '@/lib/forja-store';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CostBreakdownChart } from '@/components/charts/CostBreakdownChart';
import { MiniCostHeatmap } from '@/components/cost/MiniCostHeatmap';
import { StaggeredReveal } from '@/components/shell/StaggeredReveal';
import { EmptyState } from '@/components/shell/EmptyState';
import { toast } from '@/lib/toast';
import { typography } from '@/lib/typography';

interface CostClientProps {
  breakdown: BreakdownRow[];
  heatmap: HeatmapCell[];
  period: string;
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s) || /^[=+\-@\t\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCSV(rows: BreakdownRow[]) {
  const headers = ['Project', 'Total (USD)', 'Input', 'Output', 'Cache', 'Runs']
    .map(csvEscape)
    .join(',');
  const body = rows
    .map((r) =>
      [
        r.project,
        r.totalCost.toFixed(4),
        r.inputCost.toFixed(4),
        r.outputCost.toFixed(4),
        r.cacheCost.toFixed(4),
        r.runCount,
      ]
        .map(csvEscape)
        .join(',')
    )
    .join('\n');
  const blob = new Blob([headers + '\n' + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cost-breakdown.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
  toast.success('CSV exportado com sucesso', {
    description: `${rows.length} projeto${rows.length !== 1 ? 's' : ''} exportado${rows.length !== 1 ? 's' : ''}`,
  });
}

export function CostClient({ breakdown, heatmap, period }: CostClientProps) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  const totalCost = useMemo(
    () => breakdown.reduce((s, r) => s + r.totalCost, 0),
    [breakdown]
  );

  return (
    <div className="space-y-10">
      <StaggeredReveal staggerMs={80}>
        {/* Hero */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`${typography.display.md} text-forja-text-gold`}>Cost</h1>
            <p className={`${typography.mono.sm} text-forja-text-muted mt-1`}>{period}</p>
          </div>
          <button
            onClick={() => downloadCSV(breakdown)}
            className="flex items-center gap-2 px-4 py-2 text-xs border border-forja-border-subtle text-forja-text-muted rounded hover:border-forja-border-gold hover:text-forja-text-gold transition-colors shrink-0 mt-1"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>

        {/* Total cost card */}
        <div className="bg-forja-bg-surface border border-forja-border-default rounded-lg px-6 py-5 inline-block">
          <p className="text-forja-text-muted text-xs uppercase tracking-wide mb-1">
            Custo Total Acumulado
          </p>
          <p className="text-3xl font-mono font-semibold text-forja-text-gold">
            ${totalCost.toFixed(4)}
          </p>
          <p className="text-forja-text-muted text-xs mt-1">
            {breakdown.length} projeto{breakdown.length !== 1 ? 's' : ''} · últimos 30 dias
          </p>
        </div>

        {/* Ranked table */}
        <div>
          <h2 className="text-base font-semibold text-forja-text-primary mb-4">
            Top 10 Projetos por Custo
          </h2>
          {breakdown.length === 0 ? (
            <EmptyState
              title="Nenhum projeto"
              description="Nenhum custo registrado no período selecionado."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Projeto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Cache</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown.slice(0, 10).map((row, i) => (
                  <TableRow key={row.project}>
                    <TableCell className="text-forja-text-muted font-mono text-xs w-8">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-semibold text-forja-text-primary">
                      {row.project}
                    </TableCell>
                    <TableCell className="text-right font-mono text-forja-text-gold">
                      ${row.totalCost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-forja-text-muted text-xs">
                      ${row.inputCost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-forja-text-muted text-xs">
                      ${row.outputCost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-forja-text-muted text-xs">
                      ${row.cacheCost.toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right text-forja-text-secondary">
                      {row.runCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Stacked bar chart */}
        <div>
          <h2 className="text-base font-semibold text-forja-text-primary mb-4">
            Custo por Projeto — Breakdown Stackado
          </h2>
          {breakdown.length === 0 ? (
            <EmptyState title="Sem dados" description="Nenhum projeto com custo no período." />
          ) : (
            <div className="bg-forja-bg-surface border border-forja-border-default rounded-lg p-4">
              <CostBreakdownChart data={breakdown} />
            </div>
          )}
        </div>

        {/* Mini heatmap */}
        <div>
          <h2 className="text-base font-semibold text-forja-text-primary mb-2">
            Heatmap de Custo — 7×24
          </h2>
          <p className="text-forja-text-muted text-xs mb-4">
            Custo médio por dia da semana × hora do dia
          </p>
          {heatmap.length === 0 ? (
            <EmptyState
              title="Sem dados"
              description="Nenhum custo registrado para gerar o heatmap."
            />
          ) : (
            <div className="bg-forja-bg-surface border border-forja-border-default rounded-lg p-4 overflow-x-auto">
              <MiniCostHeatmap data={heatmap} />
            </div>
          )}
        </div>
      </StaggeredReveal>
    </div>
  );
}
