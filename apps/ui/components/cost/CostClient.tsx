'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

export function CostClient({ breakdown, heatmap, period }: CostClientProps) {
  const router = useRouter();
  const t = useTranslations('cost');

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);

  const totalCost = useMemo(
    () => breakdown.reduce((s, r) => s + r.totalCost, 0),
    [breakdown]
  );

  const PERIOD_LABELS = useMemo((): Record<Alert['period'], string> => ({
    month: t('monthly'),
    week: t('weekly'),
    day: t('daily'),
  }), [t]);

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

  const downloadCSV = useCallback((rows: BreakdownRow[]) => {
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
    toast.success(t('csv_success'), {
      description: t('csv_projects', { count: rows.length }),
    });
  }, [t]);

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
        toast.success(t('alert_created'), {
          description: t('alert_created_desc', { threshold, project: formProject.toUpperCase() }),
        });
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string };
        toast.error(t('alert_error'), { description: err.error ?? t('cancel') });
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
        toast.success(t('alert_removed'), { description: t('alert_removed_desc', { project }) });
      } else {
        toast.error(t('alert_error'));
      }
    } catch {
      toast.error(t('alert_error'));
    }
  }

  return (
    <div className="space-y-10">
      <StaggeredReveal staggerMs={80}>
        {/* Hero */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className={`${typography.display.md} text-forja-text-gold`}>{t('title')}</h1>
            <p className={`${typography.mono.sm} text-forja-text-muted mt-1`}>{period}</p>
          </div>
          <button
            onClick={() => downloadCSV(breakdown)}
            className="flex items-center gap-2 px-4 py-2 text-xs border border-forja-border-subtle text-forja-text-muted rounded hover:border-forja-border-gold hover:text-forja-text-gold transition-colors shrink-0 mt-1"
          >
            <Download size={13} />
            {t('export_csv')}
          </button>
        </div>

        {/* Total cost card */}
        <div className="bg-forja-bg-surface border border-forja-border-default rounded-lg px-6 py-5 inline-block">
          <p className="text-forja-text-muted text-xs uppercase tracking-wide mb-1">
            {t('total_accumulated')}
          </p>
          <p className="text-3xl font-mono font-semibold text-forja-text-gold">
            ${totalCost.toFixed(4)}
          </p>
          <p className="text-forja-text-muted text-xs mt-1">
            {breakdown.length} {breakdown.length !== 1 ? 'projects' : 'project'} · {t('last_30_days')}
          </p>
        </div>

        {/* Ranked table */}
        <div>
          <h2 className="text-base font-semibold text-forja-text-primary mb-4">
            {t('top_10_projects')}
          </h2>
          {breakdown.length === 0 ? (
            <EmptyState
              title={t('no_projects')}
              description={t('no_cost_desc')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.number')}</TableHead>
                  <TableHead>{t('columns.project')}</TableHead>
                  <TableHead className="text-right">{t('columns.total')}</TableHead>
                  <TableHead className="text-right">{t('columns.input')}</TableHead>
                  <TableHead className="text-right">{t('columns.output')}</TableHead>
                  <TableHead className="text-right">{t('columns.cache')}</TableHead>
                  <TableHead className="text-right">{t('columns.runs')}</TableHead>
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
            {t('cost_by_project')}
          </h2>
          {breakdown.length === 0 ? (
            <EmptyState title={t('no_data')} description={t('no_project_cost')} />
          ) : (
            <div className="bg-forja-bg-surface border border-forja-border-default rounded-lg p-4">
              <CostBreakdownChart data={breakdown} />
            </div>
          )}
        </div>

        {/* Mini heatmap */}
        <div>
          <h2 className="text-base font-semibold text-forja-text-primary mb-2">
            {t('cost_heatmap')}
          </h2>
          <p className="text-forja-text-muted text-xs mb-4">
            {t('cost_heatmap_desc')}
          </p>
          {heatmap.length === 0 ? (
            <EmptyState
              title={t('no_data')}
              description={t('no_cost_desc')}
            />
          ) : (
            <div className="bg-forja-bg-surface border border-forja-border-default rounded-lg p-4 overflow-x-auto">
              <MiniCostHeatmap data={heatmap} />
            </div>
          )}
        </div>

        {/* ── Alerts ─────────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-forja-text-muted" />
              <h2 className="text-base font-semibold text-forja-text-primary">{t('alerts')}</h2>
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-forja-border-subtle text-forja-text-muted rounded hover:border-forja-border-gold hover:text-forja-text-gold transition-colors"
            >
              <Plus size={12} />
              {t('add_alert')}
            </button>
          </div>

          {alerts.length === 0 ? (
            <EmptyState
              title={t('no_alerts')}
              description={t('no_alerts_desc')}
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
                        {fired ? t('triggered') : t('active')}
                      </span>
                      <span className="font-mono text-sm text-forja-text-primary font-semibold">
                        {alert.project}
                      </span>
                      <span className="text-forja-text-muted text-xs">
                        ${alert.threshold_usd} · {PERIOD_LABELS[alert.period]}
                        {alert.budgetCap && (
                          <span className="ml-1 text-amber-500">· {t('budget_cap')}</span>
                        )}
                      </span>
                      {alert.notifyVia.includes('slack') && (
                        <span className="text-forja-text-muted text-xs">Slack</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAlert(alert.id, alert.project)}
                      className="shrink-0 p-1.5 text-forja-text-muted hover:text-red-400 transition-colors rounded"
                      title={t('remove_alert')}
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

      {/* ── Sheet: Add alert ──────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>{t('new_alert')}</SheetTitle>
              <SheetClose asChild>
                <button className="text-forja-text-muted hover:text-forja-text-primary transition-colors">
                  <X size={16} />
                </button>
              </SheetClose>
            </div>
          </SheetHeader>

          <form onSubmit={handleCreateAlert} className="space-y-5">
            <div>
              <label className="block text-xs text-forja-text-muted mb-1">{t('project_label')}</label>
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
              <label className="block text-xs text-forja-text-muted mb-1">{t('threshold_label')}</label>
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
              <label className="block text-xs text-forja-text-muted mb-1">{t('period_label')}</label>
              <select
                value={formPeriod}
                onChange={(e) => setFormPeriod(e.target.value as Alert['period'])}
                className="w-full bg-forja-bg-base border border-forja-border-subtle rounded px-3 py-2 text-sm text-forja-text-primary focus:outline-none focus:border-forja-border-gold"
              >
                <option value="month">{t('monthly')}</option>
                <option value="week">{t('weekly')}</option>
                <option value="day">{t('daily')}</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-forja-text-muted mb-1">{t('channels')}</label>
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
              {t('budget_cap_desc')}
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 text-sm bg-forja-border-gold/10 border border-forja-border-gold text-forja-text-gold rounded hover:bg-forja-border-gold/20 transition-colors disabled:opacity-50"
              >
                {submitting ? t('creating') : t('create_alert')}
              </button>
              <button
                type="button"
                onClick={() => { setSheetOpen(false); resetForm(); }}
                className="px-4 py-2 text-sm border border-forja-border-subtle text-forja-text-muted rounded hover:border-forja-border-default transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
