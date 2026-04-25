import fs from 'fs/promises';
import path from 'path';

export interface Alert {
  id: string;
  project: string;
  threshold_usd: number;
  period: 'month' | 'week' | 'day';
  notifyVia: ('slack' | 'email')[];
  slackWebhookUrl?: string;
  budgetCap: boolean;
  lastFiredAt?: string;
}

interface AlertsFile {
  alerts: Alert[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAlertsPath(): string {
  return path.join('forja', 'alerts.json');
}

function getRunsDir(): string {
  return path.join(process.env.FORJA_STATE_DIR ?? path.join('forja', 'state'), 'runs');
}

async function readAlerts(): Promise<AlertsFile> {
  try {
    const raw = await fs.readFile(getAlertsPath(), 'utf8');
    return JSON.parse(raw) as AlertsFile;
  } catch {
    return { alerts: [] };
  }
}

async function writeAlerts(store: AlertsFile): Promise<void> {
  const alertsPath = getAlertsPath();
  await fs.mkdir(path.dirname(alertsPath), { recursive: true });
  await fs.writeFile(alertsPath, JSON.stringify(store, null, 2), 'utf8');
}

function periodStart(period: Alert['period']): Date {
  const now = new Date();
  if (period === 'day') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

interface RunCostEntry {
  issueId: string;
  startedAt: string;
  costUsd: number;
}

async function readRunCostEntry(runId: string, runsDir: string): Promise<RunCostEntry | null> {
  if (!UUID_RE.test(runId)) return null;
  const runDir = path.join(runsDir, runId);

  let issueId = '';
  let startedAt = '';
  try {
    const traceContent = await fs.readFile(path.join(runDir, 'trace.jsonl'), 'utf8');
    for (const line of traceContent.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as { eventType: string; ts: string; payload?: { issueId?: string } };
        if (event.eventType === 'run_start') {
          issueId = event.payload?.issueId ?? '';
          startedAt = event.ts;
          break;
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    return null;
  }

  if (!issueId) return null;

  let costUsd = 0;
  try {
    const costContent = await fs.readFile(path.join(runDir, 'cost.jsonl'), 'utf8');
    for (const line of costContent.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { costUsd?: number };
        costUsd += typeof entry.costUsd === 'number' ? entry.costUsd : 0;
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // no cost file — cost is 0
  }

  return { issueId, startedAt, costUsd };
}

async function computeProjectCost(project: string, from: Date): Promise<number> {
  const runsDir = getRunsDir();
  let runIds: string[];
  try {
    const dirEntries = await fs.readdir(runsDir, { withFileTypes: true });
    runIds = dirEntries
      .filter((e) => e.isDirectory() && UUID_RE.test(e.name))
      .map((e) => e.name);
  } catch {
    return 0;
  }

  const prefix = `${project}-`;
  const fromIso = from.toISOString();

  // Concurrent reads with cap of 20 to avoid fd exhaustion
  const CONCURRENCY = 20;
  let total = 0;
  for (let i = 0; i < runIds.length; i += CONCURRENCY) {
    const batch = runIds.slice(i, i + CONCURRENCY);
    const entries = await Promise.all(batch.map((id) => readRunCostEntry(id, runsDir)));
    for (const entry of entries) {
      if (!entry) continue;
      if (!entry.issueId.startsWith(prefix)) continue;
      if (entry.startedAt < fromIso) continue;
      total += entry.costUsd;
    }
  }

  return total;
}

async function notifySlack(webhookUrl: string, message: string): Promise<void> {
  if (!/^https:\/\/hooks\.slack\.com\/services\//.test(webhookUrl)) {
    console.warn('[forja/alerts] Skipping Slack notify: invalid webhook URL (must be hooks.slack.com)');
    return;
  }
  const body = JSON.stringify({ text: message });
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 1000 * attempt));
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) return;
      console.warn(`[forja/alerts] Slack notify attempt ${attempt + 1} failed: ${res.status}`);
    } catch (err) {
      console.warn(`[forja/alerts] Slack notify attempt ${attempt + 1} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export async function evaluate(): Promise<void> {
  const store = await readAlerts();
  if (store.alerts.length === 0) return;

  let dirty = false;
  const costCache = new Map<string, number>();

  for (const alert of store.alerts) {
    const cacheKey = `${alert.project}:${alert.period}`;
    let currentCost = costCache.get(cacheKey);
    if (currentCost === undefined) {
      currentCost = await computeProjectCost(alert.project, periodStart(alert.period));
      costCache.set(cacheKey, currentCost);
    }

    if (currentCost <= alert.threshold_usd) continue;
    if (alert.lastFiredAt && new Date(alert.lastFiredAt) >= periodStart(alert.period)) continue;

    alert.lastFiredAt = new Date().toISOString();
    dirty = true;

    const message = `*[Forja Alert]* Projeto *${alert.project}* excedeu threshold de custo.\nCusto atual: $${currentCost.toFixed(4)}, limite: $${alert.threshold_usd} (período: ${alert.period}).`;

    for (const channel of alert.notifyVia) {
      if (channel === 'slack' && alert.slackWebhookUrl) {
        await notifySlack(alert.slackWebhookUrl, message);
      }
    }
  }

  if (dirty) {
    await writeAlerts(store);
  }
}

export async function isProjectCapped(projectPrefix: string): Promise<{ capped: boolean; currentCost: number; limit: number }> {
  const store = await readAlerts();
  const caps = store.alerts.filter((a) => a.project === projectPrefix && a.budgetCap);
  if (caps.length === 0) return { capped: false, currentCost: 0, limit: 0 };

  // Compute cost once per unique period (memoize within this call)
  const costCache = new Map<string, number>();
  async function getCost(period: Alert['period']): Promise<number> {
    if (costCache.has(period)) return costCache.get(period)!;
    const cost = await computeProjectCost(projectPrefix, periodStart(period));
    costCache.set(period, cost);
    return cost;
  }

  for (const cap of caps) {
    const currentCost = await getCost(cap.period);
    if (currentCost > cap.threshold_usd) {
      return { capped: true, currentCost, limit: cap.threshold_usd };
    }
  }

  return { capped: false, currentCost: 0, limit: 0 };
}
