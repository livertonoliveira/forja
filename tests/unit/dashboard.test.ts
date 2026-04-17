import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { generateDashboard } from '../../src/trace/dashboard.js';

// Track run IDs created during tests so we can clean them up
const createdRunIds: string[] = [];

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function runDir(runId: string): string {
  return path.join('forja', 'state', 'runs', runId);
}

async function ensureRunDir(runId: string): Promise<void> {
  await fs.mkdir(runDir(runId), { recursive: true });
}

async function writeTrace(runId: string, events: object[]): Promise<void> {
  await ensureRunDir(runId);
  const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(path.join(runDir(runId), 'trace.jsonl'), lines, 'utf8');
}

async function writeFindings(runId: string, findings: object[]): Promise<void> {
  await ensureRunDir(runId);
  await fs.writeFile(path.join(runDir(runId), 'findings.json'), JSON.stringify(findings, null, 2), 'utf8');
}

async function writeCost(runId: string, lines: object[]): Promise<void> {
  await ensureRunDir(runId);
  const content = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  await fs.writeFile(path.join(runDir(runId), 'cost.jsonl'), content, 'utf8');
}

async function cleanupRun(runId: string): Promise<void> {
  try {
    await fs.rm(runDir(runId), { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

afterEach(async () => {
  await Promise.all(createdRunIds.splice(0).map(cleanupRun));
});

// ---------------------------------------------------------------------------
// Helpers to build valid trace events
// ---------------------------------------------------------------------------

function makeEvent(runId: string, eventType: string, payload: Record<string, unknown>) {
  return {
    id: randomUUID(),
    runId,
    eventType,
    ts: new Date().toISOString(),
    payload,
  };
}

function makePhaseStartEvent(runId: string, phase: string, ts: string) {
  return { id: randomUUID(), runId, eventType: 'phase_start', ts, payload: { phase } };
}

function makePhaseEndEvent(runId: string, phase: string, ts: string, status = 'success') {
  return { id: randomUUID(), runId, eventType: 'phase_end', ts, payload: { phase, status } };
}

function makeGateEvent(runId: string, phase: string, decision: string) {
  return {
    id: randomUUID(),
    runId,
    eventType: 'gate',
    ts: new Date().toISOString(),
    payload: {
      phase,
      decision,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      policyApplied: 'default',
      decidedAt: new Date().toISOString(),
    },
  };
}

function makeRunStartEvent(runId: string, ts: string) {
  return {
    id: randomUUID(),
    runId,
    eventType: 'run_start',
    ts,
    payload: {
      issue: 'MOB-123',
      branch: 'feat/mob-123',
      model: 'claude-opus',
    },
  };
}

function makeRunEndEvent(runId: string, ts: string, status = 'success') {
  return {
    id: randomUUID(),
    runId,
    eventType: 'run_end',
    ts,
    payload: { status },
  };
}

function makeFinding(runId: string, severity: 'critical' | 'high' | 'medium' | 'low') {
  return {
    id: randomUUID(),
    runId,
    phaseId: randomUUID(),
    severity,
    category: 'security',
    title: `Finding ${severity}`,
    description: `A ${severity} finding`,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 1. generateDashboard produces Markdown with required sections
// ---------------------------------------------------------------------------

describe('generateDashboard — produces Markdown with all required sections', () => {
  it('returns a string starting with "# Relatório de Run"', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    const result = await generateDashboard(runId);
    expect(result).toContain(`# Relatório de Run — ${runId}`);
  });

  it('contains the Timeline section header', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    const result = await generateDashboard(runId);
    expect(result).toContain('## Timeline de Fases');
  });

  it('contains the Findings summary section header', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    const result = await generateDashboard(runId);
    expect(result).toContain('## Resumo de Findings');
  });

  it('contains Issue, Branch, Status, Custo Total and Modelo metadata fields', async () => {
    const runId = makeRunId();
    const startTs = '2024-01-15T10:00:00.000Z';
    const endTs = '2024-01-15T10:05:00.000Z';

    await writeTrace(runId, [
      makeRunStartEvent(runId, startTs),
      makeRunEndEvent(runId, endTs, 'success'),
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('**Issue:**');
    expect(result).toContain('**Branch:**');
    expect(result).toContain('**Status:**');
    expect(result).toContain('**Custo Total:**');
    expect(result).toContain('**Modelo:**');
  });
});

// ---------------------------------------------------------------------------
// 2. Phase timeline shows durations calculated from phase_start/phase_end events
// ---------------------------------------------------------------------------

describe('generateDashboard — phase timeline with durations', () => {
  it('shows phase name in the timeline table', async () => {
    const runId = makeRunId();
    const startTs = '2024-01-15T10:00:00.000Z';
    const endTs = '2024-01-15T10:01:00.000Z'; // 60 seconds later

    await writeTrace(runId, [
      makePhaseStartEvent(runId, 'develop', startTs),
      makePhaseEndEvent(runId, 'develop', endTs, 'success'),
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('develop');
  });

  it('shows duration in table row when start and end timestamps exist', async () => {
    const runId = makeRunId();
    const startTs = '2024-01-15T10:00:00.000Z';
    const endTs = '2024-01-15T10:01:00.000Z'; // 60 seconds later

    await writeTrace(runId, [
      makePhaseStartEvent(runId, 'develop', startTs),
      makePhaseEndEvent(runId, 'develop', endTs, 'success'),
    ]);

    const result = await generateDashboard(runId);
    // 60 seconds = 1m 00s
    expect(result).toContain('1m 00s');
  });

  it('shows phase status as ✅ pronto for success', async () => {
    const runId = makeRunId();
    const ts = '2024-01-15T10:00:00.000Z';

    await writeTrace(runId, [
      makePhaseStartEvent(runId, 'test', ts),
      makePhaseEndEvent(runId, 'test', new Date(new Date(ts).getTime() + 30000).toISOString(), 'success'),
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('✅ pronto');
  });

  it('shows phase status as ❌ falhou for failed phases', async () => {
    const runId = makeRunId();
    const ts = '2024-01-15T10:00:00.000Z';

    await writeTrace(runId, [
      makePhaseStartEvent(runId, 'security', ts),
      makePhaseEndEvent(runId, 'security', new Date(new Date(ts).getTime() + 10000).toISOString(), 'failed'),
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('❌ falhou');
  });

  it('shows gate decision for a phase', async () => {
    const runId = makeRunId();
    const ts = '2024-01-15T10:00:00.000Z';

    await writeTrace(runId, [
      makePhaseStartEvent(runId, 'review', ts),
      makePhaseEndEvent(runId, 'review', new Date(new Date(ts).getTime() + 5000).toISOString(), 'success'),
      makeGateEvent(runId, 'review', 'pass'),
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('✅ aprovado');
  });

  it('shows multiple phases in the timeline', async () => {
    const runId = makeRunId();
    const base = new Date('2024-01-15T10:00:00.000Z').getTime();

    await writeTrace(runId, [
      makePhaseStartEvent(runId, 'develop', new Date(base).toISOString()),
      makePhaseEndEvent(runId, 'develop', new Date(base + 60000).toISOString(), 'success'),
      makePhaseStartEvent(runId, 'test', new Date(base + 60000).toISOString()),
      makePhaseEndEvent(runId, 'test', new Date(base + 90000).toISOString(), 'success'),
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('develop');
    expect(result).toContain('test');
  });
});

// ---------------------------------------------------------------------------
// 3. Cost values come from cost.jsonl
// ---------------------------------------------------------------------------

describe('generateDashboard — cost values from cost.jsonl', () => {
  it('shows $0.0000 total cost when no cost.jsonl exists', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    const result = await generateDashboard(runId);
    expect(result).toContain('**Custo Total:** $0.0000');
  });

  it('shows total cost from cost.jsonl entries', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    await writeCost(runId, [
      { phase: 'develop', tokensIn: 1000, tokensOut: 500, costUsd: 0.0150 },
      { phase: 'test', tokensIn: 500, tokensOut: 200, costUsd: 0.0075 },
    ]);

    const result = await generateDashboard(runId);
    // Total: 0.0150 + 0.0075 = 0.0225
    expect(result).toContain('**Custo Total:** $0.0225');
  });

  it('shows per-phase cost in the timeline table', async () => {
    const runId = makeRunId();
    const ts = '2024-01-15T10:00:00.000Z';

    await writeTrace(runId, [
      makePhaseStartEvent(runId, 'develop', ts),
      makePhaseEndEvent(runId, 'develop', new Date(new Date(ts).getTime() + 30000).toISOString(), 'success'),
    ]);

    await writeCost(runId, [
      { phase: 'develop', tokensIn: 1000, tokensOut: 500, costUsd: 0.0150 },
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('$0.0150');
  });
});

// ---------------------------------------------------------------------------
// 4. Findings section lists all findings from findings.json
// ---------------------------------------------------------------------------

describe('generateDashboard — findings section counts', () => {
  it('shows zero counts for all severities when no findings.json exists', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    const result = await generateDashboard(runId);
    expect(result).toContain('| crítico | 0 |');
    expect(result).toContain('| alto | 0 |');
    expect(result).toContain('| médio | 0 |');
    expect(result).toContain('| baixo | 0 |');
  });

  it('counts findings by severity correctly', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    await writeFindings(runId, [
      makeFinding(runId, 'critical'),
      makeFinding(runId, 'critical'),
      makeFinding(runId, 'high'),
      makeFinding(runId, 'medium'),
      makeFinding(runId, 'medium'),
      makeFinding(runId, 'medium'),
      makeFinding(runId, 'low'),
    ]);

    const result = await generateDashboard(runId);
    expect(result).toContain('| crítico | 2 |');
    expect(result).toContain('| alto | 1 |');
    expect(result).toContain('| médio | 3 |');
    expect(result).toContain('| baixo | 1 |');
  });

  it('contains a Markdown table with severity and count columns', async () => {
    const runId = makeRunId();
    await ensureRunDir(runId);

    const result = await generateDashboard(runId);
    expect(result).toContain('| Severidade | Quantidade |');
  });
});

// ---------------------------------------------------------------------------
// 5. Empty trace (no trace.jsonl) produces minimal report without errors
// ---------------------------------------------------------------------------

describe('generateDashboard — empty trace (ENOENT) produces minimal report', () => {
  it('does not throw when trace.jsonl does not exist', async () => {
    const runId = makeRunId();
    // Do NOT create any files — no run directory at all
    await expect(generateDashboard(runId)).resolves.not.toThrow();
  });

  it('returns a string (not undefined or null) when trace.jsonl is missing', async () => {
    const runId = makeRunId();
    const result = await generateDashboard(runId);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains the run ID in the header even with no trace file', async () => {
    const runId = makeRunId();
    const result = await generateDashboard(runId);
    expect(result).toContain(runId);
  });

  it('contains all section headers even with no trace file', async () => {
    const runId = makeRunId();
    const result = await generateDashboard(runId);
    expect(result).toContain('## Timeline de Fases');
    expect(result).toContain('## Resumo de Findings');
  });

  it('shows N/A for timing fields when trace is empty', async () => {
    const runId = makeRunId();
    const result = await generateDashboard(runId);
    expect(result).toContain('**Iniciado:** N/A');
    expect(result).toContain('**Duração:** N/A');
  });

  it('shows — placeholder row in the timeline when there are no phases', async () => {
    const runId = makeRunId();
    const result = await generateDashboard(runId);
    // When no phase events, renders a single placeholder row
    expect(result).toContain('| — | — | — | — | — | — |');
  });

  it('shows zero findings counts when both trace and findings files are absent', async () => {
    const runId = makeRunId();
    const result = await generateDashboard(runId);
    expect(result).toContain('| crítico | 0 |');
    expect(result).toContain('| baixo | 0 |');
  });
});

// ---------------------------------------------------------------------------
// 6. Full happy path — complete data produces full report
// ---------------------------------------------------------------------------

describe('generateDashboard — happy path with complete data', () => {
  it('produces a full report with all sections populated', async () => {
    const runId = makeRunId();
    const base = new Date('2024-06-01T09:00:00.000Z').getTime();

    // Write trace with full run lifecycle
    await writeTrace(runId, [
      makeRunStartEvent(runId, new Date(base).toISOString()),
      makePhaseStartEvent(runId, 'develop', new Date(base + 1000).toISOString()),
      makePhaseEndEvent(runId, 'develop', new Date(base + 61000).toISOString(), 'success'),
      makeGateEvent(runId, 'develop', 'pass'),
      makePhaseStartEvent(runId, 'test', new Date(base + 62000).toISOString()),
      makePhaseEndEvent(runId, 'test', new Date(base + 92000).toISOString(), 'success'),
      makeGateEvent(runId, 'test', 'warn'),
      makeRunEndEvent(runId, new Date(base + 93000).toISOString(), 'success'),
    ]);

    // Write findings
    await writeFindings(runId, [
      makeFinding(runId, 'high'),
      makeFinding(runId, 'medium'),
      makeFinding(runId, 'low'),
    ]);

    // Write costs
    await writeCost(runId, [
      { phase: 'develop', tokensIn: 2000, tokensOut: 800, costUsd: 0.0250 },
      { phase: 'test', tokensIn: 1000, tokensOut: 400, costUsd: 0.0125 },
    ]);

    const result = await generateDashboard(runId);

    // Header section
    expect(result).toContain(`# Relatório de Run — ${runId}`);
    expect(result).toContain('**Issue:** MOB-123');
    expect(result).toContain('**Branch:** feat/mob-123');
    expect(result).toContain('**Modelo:** claude-opus');
    expect(result).toContain('**Status:** ✅ passou');

    // Timeline section
    expect(result).toContain('## Timeline de Fases');
    expect(result).toContain('develop');
    expect(result).toContain('test');
    expect(result).toContain('✅ aprovado');
    expect(result).toContain('⚠️ aviso');

    // Cost
    expect(result).toContain('**Custo Total:** $0.0375');

    // Findings section
    expect(result).toContain('## Resumo de Findings');
    expect(result).toContain('| alto | 1 |');
    expect(result).toContain('| médio | 1 |');
    expect(result).toContain('| baixo | 1 |');
    expect(result).toContain('| crítico | 0 |');
  });
});
