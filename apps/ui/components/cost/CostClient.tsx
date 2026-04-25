'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Download, Plus, Trash2, X } from 'lucide-react';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';
import { toast } from '@/lib/toast';
import { typography } from '@/lib/typography';

interface Alert {
  id: string;
  project: string;
  threshold_usd: number;
  period: 'month' | 'week' | 'day';
  notifyVia: ('slack' | 'email')[];
  slackWebhookUrl?: string;
  budgetCap: boolean;
  lastFiredAt?: string;
}

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

function getPeriodStart(period: Alert['period']): Date {
  const now = new Date();
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function isFired(alert: Alert): boolean {
  if (!alert.lastFiredAt) return false;
  return new Date(alert.lastFiredAt) >= getPeriodStart(alert.period);
}

const PERIOD_LABELS: Record<Alert['period'], string> = {
  month: 'Mensal',
  week: 'Semanal',
  day: 'Diário',
};

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

  // ── Alerts state ────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formProject, setFormProject] = useState('');
  const [formThreshold, setFormThreshold] = useState('');
  const [formPeriod, setFormPeriod] = useState<Alert['period']>('month');
  const [formSlack, setFormSlack] = useState(false);
  const [formSlackUrl, setFormSlackUrl] = useState('');
  const [formBudgetCap, setFormBudgetCap] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/cost/alerts');
      if (res.ok) setAlerts(await res.json());
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  function resetForm() {
    setFormProject('');
    setFormThreshold('');
    setFormPeriod('month');
    setFormSlack(false);
    setFormSlackUrl('');
    setFormBudgetCap(false);
  }

  async function handleCreateAlert(e: React.FormEvent) {
    e.preventDefault();
    const threshold = parseFloat(formThreshold);
    if (!formProject || isNaN(threshold) || threshold <= 0) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        project: formProject.toUpperCase(),
        threshold_usd: threshold,
        period: formPeriod,
        notifyVia: formSlack ? ['slack'] : [],
        budgetCap: formBudgetCap,
      };
      if (formSlack && formSlackUrl) body.slackWebhookUrl = formSlackUrl;

      const res = await fetch('/api/cost/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const created = await res.json() as Alert;
        setAlerts((prev) => [...prev, created]);
        setSheetOpen(false);
        resetForm();
        toast.success('Alerta criado', { description: `Threshold $${threshold} para ${formProject.toUpperCase()}` });
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error('Erro ao criar alerta', { description: err.error ?? 'Tente novamente' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteAlert(id: string, project: string) {
    try {
      const res = await fetch(`/api/cost/alerts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        toast.success('Alerta removido', { description: `Alerta de ${project} removido` });
      } else {
        toast.error('Erro ao remover alerta');
      }
    } catch {
      toast.error('Erro ao remover alerta');
    }
  }

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

        {/* ── Alertas ─────────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-forja-text-muted" />
              <h2 className="text-base font-semibold text-forja-text-primary">Alertas</h2>
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-forja-border-subtle text-forja-text-muted rounded hover:border-forja-border-gold hover:text-forja-text-gold transition-colors"
            >
              <Plus size={12} />
              Adicionar alerta
            </button>
          </div>

          {alerts.length === 0 ? (
            <EmptyState
              title="Nenhum alerta configurado"
              description="Configure alertas de custo para receber notificações quando thresholds forem ultrapassados."
            />
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => {
                const fired = isFired(alert);
                return (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between bg-forja-bg-surface border border-forja-border-default rounded-lg px-4 py-3 gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                          fired
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {fired ? 'Disparado' : 'Ativo'}
                      </span>
                      <span className="font-mono text-sm text-forja-text-primary font-semibold">
                        {alert.project}
                      </span>
                      <span className="text-forja-text-muted text-xs">
                        ${alert.threshold_usd} · {PERIOD_LABELS[alert.period]}
                        {alert.budgetCap && (
                          <span className="ml-1 text-amber-500">· Budget Cap</span>
                        )}
                      </span>
                      {alert.notifyVia.includes('slack') && (
                        <span className="text-forja-text-muted text-xs">Slack</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAlert(alert.id, alert.project)}
                      className="shrink-0 p-1.5 text-forja-text-muted hover:text-red-400 transition-colors rounded"
                      title="Remover alerta"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </StaggeredReveal>

      {/* ── Sheet: Adicionar alerta ──────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>Novo Alerta</SheetTitle>
              <SheetClose asChild>
                <button className="text-forja-text-muted hover:text-forja-text-primary transition-colors">
                  <X size={16} />
                </button>
              </SheetClose>
            </div>
          </SheetHeader>

          <form onSubmit={handleCreateAlert} className="space-y-5">
            <div>
              <label className="block text-xs text-forja-text-muted mb-1">Projeto</label>
              <input
                type="text"
                value={formProject}
                onChange={(e) => setFormProject(e.target.value.toUpperCase())}
                placeholder="MOB"
                maxLength={20}
                required
                className="w-full bg-forja-bg-base border border-forja-border-subtle rounded px-3 py-2 text-sm text-forja-text-primary placeholder:text-forja-text-muted focus:outline-none focus:border-forja-border-gold"
              />
            </div>

            <div>
              <label className="block text-xs text-forja-text-muted mb-1">Threshold (USD)</label>
              <input
                type="number"
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
                placeholder="50"
                min={0.01}
                step="0.01"
                required
                className="w-full bg-forja-bg-base border border-forja-border-subtle rounded px-3 py-2 text-sm text-forja-text-primary placeholder:text-forja-text-muted focus:outline-none focus:border-forja-border-gold"
              />
            </div>

            <div>
              <label className="block text-xs text-forja-text-muted mb-1">Período</label>
              <select
                value={formPeriod}
                onChange={(e) => setFormPeriod(e.target.value as Alert['period'])}
                className="w-full bg-forja-bg-base border border-forja-border-subtle rounded px-3 py-2 text-sm text-forja-text-primary focus:outline-none focus:border-forja-border-gold"
              >
                <option value="month">Mensal</option>
                <option value="week">Semanal</option>
                <option value="day">Diário</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-forja-text-muted mb-1">Canais</label>
              <label className="flex items-center gap-2 text-sm text-forja-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSlack}
                  onChange={(e) => setFormSlack(e.target.checked)}
                  className="accent-forja-border-gold"
                />
                Slack
              </label>
              {formSlack && (
                <input
                  type="url"
                  value={formSlackUrl}
                  onChange={(e) => setFormSlackUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full bg-forja-bg-base border border-forja-border-subtle rounded px-3 py-2 text-sm text-forja-text-primary placeholder:text-forja-text-muted focus:outline-none focus:border-forja-border-gold"
                />
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-forja-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={formBudgetCap}
                onChange={(e) => setFormBudgetCap(e.target.checked)}
                className="accent-forja-border-gold"
              />
              Budget Cap (bloqueia novos runs ao ultrapassar)
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 text-sm bg-forja-border-gold/10 border border-forja-border-gold text-forja-text-gold rounded hover:bg-forja-border-gold/20 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Criando...' : 'Criar alerta'}
              </button>
              <button
                type="button"
                onClick={() => { setSheetOpen(false); resetForm(); }}
                className="px-4 py-2 text-sm border border-forja-border-subtle text-forja-text-muted rounded hover:border-forja-border-default transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
