/**
 * Unit tests for MOB-1108 — alerts evaluator (alerts-evaluator.ts).
 *
 * Covers:
 *  - isProjectCapped: missing alerts file, budgetCap false, cost below/above threshold
 *  - evaluate: no alerts (no-op), threshold not exceeded, threshold exceeded (updates lastFiredAt),
 *              debounce (already fired in current period)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { evaluate, isProjectCapped } from '../../src/cost/alerts-evaluator.js';
import type { Alert } from '../../src/cost/alerts-evaluator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALERTS_PATH = path.join('forja', 'alerts.json');
const createdRunIds: string[] = [];

interface AlertsFile {
  alerts: Alert[];
}

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function runDir(runId: string): string {
  return path.join('forja', 'state', 'runs', runId);
}

async function writeAlertsFile(alerts: Alert[]): Promise<void> {
  await fs.mkdir(path.dirname(ALERTS_PATH), { recursive: true });
  await fs.writeFile(ALERTS_PATH, JSON.stringify({ alerts }, null, 2), 'utf8');
}

async function readAlertsFile(): Promise<AlertsFile> {
  const raw = await fs.readFile(ALERTS_PATH, 'utf8');
  return JSON.parse(raw) as AlertsFile;
}

async function createFakeRun(runId: string, issueId: string, costUsd: number): Promise<void> {
  const dir = runDir(runId);
  await fs.mkdir(dir, { recursive: true });

  const traceEvent = JSON.stringify({
    eventType: 'run_start',
    ts: new Date().toISOString(),
    payload: { issueId },
  });
  await fs.writeFile(path.join(dir, 'trace.jsonl'), traceEvent + '\n', 'utf8');

  const costEntry = JSON.stringify({
    phase: 'dev',
    tokensIn: 100,
    tokensOut: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd,
  });
  await fs.writeFile(path.join(dir, 'cost.jsonl'), costEntry + '\n', 'utf8');
}

async function cleanupRun(runId: string): Promise<void> {
  try {
    await fs.rm(runDir(runId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function cleanupAlertsFile(): Promise<void> {
  try {
    await fs.rm(ALERTS_PATH, { force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanupAlertsFile();
  await Promise.all(createdRunIds.splice(0).map(cleanupRun));
});

// ---------------------------------------------------------------------------
// isProjectCapped — no alerts configured
// ---------------------------------------------------------------------------

describe('isProjectCapped — no alerts configured', () => {
  it('returns { capped: false } when forja/alerts.json does not exist', async () => {
    // Ensure no alerts file exists
    await cleanupAlertsFile();

    const result = await isProjectCapped('TEST');
    expect(result.capped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isProjectCapped — budgetCap: false
// ---------------------------------------------------------------------------

describe('isProjectCapped — budgetCap false', () => {
  it('returns { capped: false } even when cost would exceed threshold', async () => {
    const runId = makeRunId();
    await createFakeRun(runId, 'MYPROJ-001', 999);

    await writeAlertsFile([
      {
        id: randomUUID(),
        project: 'MYPROJ',
        threshold_usd: 1,
        period: 'month',
        notifyVia: [],
        budgetCap: false,
      },
    ]);

    const result = await isProjectCapped('MYPROJ');
    expect(result.capped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isProjectCapped — budgetCap: true, cost below threshold
// ---------------------------------------------------------------------------

describe('isProjectCapped — budgetCap true, cost below threshold', () => {
  it('returns { capped: false } when project has $0 cost and threshold is $50', async () => {
    await writeAlertsFile([
      {
        id: randomUUID(),
        project: 'LOWCOST',
        threshold_usd: 50,
        period: 'month',
        notifyVia: [],
        budgetCap: true,
      },
    ]);

    const result = await isProjectCapped('LOWCOST');
    expect(result.capped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isProjectCapped — budgetCap: true, cost above threshold
// ---------------------------------------------------------------------------

describe('isProjectCapped — budgetCap true, cost above threshold', () => {
  it('returns { capped: true, currentCost: 5, limit: 1 }', async () => {
    const runId = makeRunId();
    await createFakeRun(runId, 'TEST-001', 5);

    await writeAlertsFile([
      {
        id: randomUUID(),
        project: 'TEST',
        threshold_usd: 1,
        period: 'month',
        notifyVia: [],
        budgetCap: true,
      },
    ]);

    const result = await isProjectCapped('TEST');
    expect(result.capped).toBe(true);
    expect(result.currentCost).toBe(5);
    expect(result.limit).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// evaluate — no alerts, no-op
// ---------------------------------------------------------------------------

describe('evaluate — no alerts, no-op', () => {
  it('resolves without error when alerts.json is missing', async () => {
    await cleanupAlertsFile();
    await expect(evaluate()).resolves.toBeUndefined();
  });

  it('resolves without error when alerts array is empty', async () => {
    await writeAlertsFile([]);
    await expect(evaluate()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluate — threshold not exceeded, no notification
// ---------------------------------------------------------------------------

describe('evaluate — threshold not exceeded', () => {
  it('does not modify lastFiredAt when cost is $0 and threshold is $100', async () => {
    const alertId = randomUUID();
    await writeAlertsFile([
      {
        id: alertId,
        project: 'NOOP',
        threshold_usd: 100,
        period: 'month',
        notifyVia: ['slack'],
        slackWebhookUrl: 'https://hooks.slack.com/fake',
        budgetCap: false,
      },
    ]);

    await evaluate();

    const updated = await readAlertsFile();
    const alert = updated.alerts.find((a) => a.id === alertId);
    expect(alert?.lastFiredAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluate — threshold exceeded, updates lastFiredAt
// ---------------------------------------------------------------------------

describe('evaluate — threshold exceeded', () => {
  it('sets lastFiredAt when project cost exceeds threshold', async () => {
    const runId = makeRunId();
    await createFakeRun(runId, 'FIRED-001', 5);

    const alertId = randomUUID();
    await writeAlertsFile([
      {
        id: alertId,
        project: 'FIRED',
        threshold_usd: 1,
        period: 'month',
        notifyVia: ['slack'],
        slackWebhookUrl: 'https://hooks.slack.com/fake',
        budgetCap: false,
      },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await evaluate();

    const updated = await readAlertsFile();
    const alert = updated.alerts.find((a) => a.id === alertId);
    expect(alert?.lastFiredAt).toBeDefined();
    expect(typeof alert?.lastFiredAt).toBe('string');
    // lastFiredAt should be a valid ISO date close to now
    const firedAt = new Date(alert!.lastFiredAt!).getTime();
    expect(firedAt).toBeGreaterThan(Date.now() - 5000);
  });
});

// ---------------------------------------------------------------------------
// evaluate — debounce: already fired in current period
// ---------------------------------------------------------------------------

describe('evaluate — debounce', () => {
  it('does not call fetch when lastFiredAt is set to today', async () => {
    const runId = makeRunId();
    await createFakeRun(runId, 'DEBOUNCE-001', 5);

    const alertId = randomUUID();
    // Set lastFiredAt to the current hour (within today's period)
    const recentFiredAt = new Date().toISOString();

    await writeAlertsFile([
      {
        id: alertId,
        project: 'DEBOUNCE',
        threshold_usd: 1,
        period: 'day',
        notifyVia: ['slack'],
        slackWebhookUrl: 'https://hooks.slack.com/fake',
        budgetCap: false,
        lastFiredAt: recentFiredAt,
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await evaluate();

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
