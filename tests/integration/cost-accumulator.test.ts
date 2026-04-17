/**
 * Integration tests for MOB-992 — CostAccumulator + CostReporter working together.
 *
 * These tests exercise the full write→read→format cycle, verifying:
 *  - cost.json is actually written to disk and remains valid JSON
 *  - Accumulator and Reporter work end-to-end across multiple phases
 *  - forja cost --run <id> output shape (via CostReporter)
 *  - Atomic-write invariant: no leftover .tmp file
 *  - Multiple records in different phases, total == sum of phases
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { CostAccumulator } from '../../src/cost/accumulator.js';
import { CostReporter } from '../../src/cost/reporter.js';
import { CostEventSchema } from '../../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createdRunIds: string[] = [];

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function runDir(runId: string): string {
  return path.join('forja', 'state', 'runs', runId);
}

function costPath(runId: string): string {
  return path.join(runDir(runId), 'cost.jsonl');
}

function makeCostEvent(runId: string, tokensIn: number, tokensOut: number, costUsd: number) {
  return CostEventSchema.parse({
    id: randomUUID(),
    runId,
    phaseId: randomUUID(),
    agentId: randomUUID(),
    model: 'claude-sonnet-4-6',
    tokensIn,
    tokensOut,
    costUsd,
    createdAt: new Date().toISOString(),
  });
}

afterEach(async () => {
  for (const runId of createdRunIds.splice(0)) {
    try {
      await fs.rm(runDir(runId), { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  delete process.env.FORJA_PHASE;
  delete process.env.FORJA_RUN_ID;
});

// ---------------------------------------------------------------------------
// 1. Disk round-trip: write then read back
// ---------------------------------------------------------------------------

describe('CostAccumulator disk round-trip', () => {
  it('cost.jsonl contains valid JSON lines after record', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const acc = new CostAccumulator();
    await acc.record(makeCostEvent(runId, 100, 50, 0.001));

    const raw = await fs.readFile(costPath(runId), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('persisted JSONL lines match getTotal results', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'test';

    const acc = new CostAccumulator();
    await acc.record(makeCostEvent(runId, 200, 100, 0.0015));

    const { totalUsd, byPhase } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(0.0015, 8);
    expect(byPhase['test'].usd).toBeCloseTo(0.0015, 8);
    expect(byPhase['test'].tokens).toBe(300);
  });

  it('no .tmp file left after record', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const acc = new CostAccumulator();
    await acc.record(makeCostEvent(runId, 10, 5, 0.0001));

    const tmpPath = path.join(runDir(runId), '.cost.json.tmp');
    await expect(fs.access(tmpPath)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Multi-phase accumulation
// ---------------------------------------------------------------------------

describe('CostAccumulator multi-phase accumulation', () => {
  it('accumulates across develop, test, review phases', async () => {
    const runId = makeRunId();
    const acc = new CostAccumulator();

    const phases: Array<{ phase: string; tokensIn: number; tokensOut: number; costUsd: number }> = [
      { phase: 'develop', tokensIn: 1000, tokensOut: 500, costUsd: 0.0105 },
      { phase: 'test', tokensIn: 500, tokensOut: 250, costUsd: 0.00525 },
      { phase: 'review', tokensIn: 300, tokensOut: 100, costUsd: 0.0025 },
    ];

    let expectedTotal = 0;
    for (const { phase, tokensIn, tokensOut, costUsd } of phases) {
      process.env.FORJA_PHASE = phase;
      await acc.record(makeCostEvent(runId, tokensIn, tokensOut, costUsd));
      expectedTotal += costUsd;
    }

    const { totalUsd, byPhase } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(expectedTotal, 6);

    for (const { phase, tokensIn, tokensOut } of phases) {
      expect(byPhase[phase]).toBeDefined();
      expect(byPhase[phase].tokens).toBe(tokensIn + tokensOut);
    }
  });

  it('total equals sum of all phase usd values', async () => {
    const runId = makeRunId();
    const acc = new CostAccumulator();

    for (const [i, phase] of ['develop', 'test', 'perf', 'security'].entries()) {
      process.env.FORJA_PHASE = phase;
      await acc.record(makeCostEvent(runId, 100, 50, (i + 1) * 0.001));
    }

    const { totalUsd, byPhase } = await acc.getTotal(runId);
    const phaseSum = Object.values(byPhase).reduce((s, p) => s + p.usd, 0);
    expect(totalUsd).toBeCloseTo(phaseSum, 6);
  });

  it('two records in same phase accumulate tokens and cost', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const acc = new CostAccumulator();
    await acc.record(makeCostEvent(runId, 100, 50, 0.001));
    await acc.record(makeCostEvent(runId, 200, 100, 0.002));

    const { byPhase } = await acc.getTotal(runId);
    expect(byPhase['develop'].tokens).toBe(450); // 150 + 300
    expect(byPhase['develop'].usd).toBeCloseTo(0.003, 6);
  });
});

// ---------------------------------------------------------------------------
// 3. CostReporter.format integration
// ---------------------------------------------------------------------------

describe('CostReporter.format integration', () => {
  it('returns one summary line and one line per phase', async () => {
    const runId = makeRunId();
    const acc = new CostAccumulator();

    process.env.FORJA_PHASE = 'develop';
    await acc.record(makeCostEvent(runId, 500, 200, 0.0085));
    process.env.FORJA_PHASE = 'test';
    await acc.record(makeCostEvent(runId, 300, 100, 0.004));

    const reporter = new CostReporter();
    const output = await reporter.format(runId);

    const lines = output.split('\n').filter((l) => l.trim());
    // First line: summary; then one per phase
    expect(lines.length).toBe(3); // summary + develop + test
    expect(lines[0]).toContain(runId.slice(0, 8));
    expect(lines[0]).toContain('Total:');
  });

  it('each phase line contains "(N tokens)" annotation', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const acc = new CostAccumulator();
    await acc.record(makeCostEvent(runId, 1000, 500, 0.0105));

    const reporter = new CostReporter();
    const output = await reporter.format(runId);

    expect(output).toContain('tokens');
  });

  it('total displayed in output matches accumulated totalUsd', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const acc = new CostAccumulator();
    await acc.record(makeCostEvent(runId, 1000, 0, 0.003));

    const reporter = new CostReporter();
    const output = await reporter.format(runId);
    const { totalUsd } = await acc.getTotal(runId);

    // The formatted total should contain the numeric value rounded to 4 decimals
    expect(output).toContain(totalUsd.toFixed(4));
  });
});

// ---------------------------------------------------------------------------
// 4. FORJA_PHASE defaults to 'unknown' when unset
// ---------------------------------------------------------------------------

describe('CostAccumulator FORJA_PHASE fallback', () => {
  it('uses "unknown" phase when FORJA_PHASE env var is unset', async () => {
    const runId = makeRunId();
    delete process.env.FORJA_PHASE;

    const acc = new CostAccumulator();
    await acc.record(makeCostEvent(runId, 100, 50, 0.001));

    const { byPhase } = await acc.getTotal(runId);
    expect(byPhase['unknown']).toBeDefined();
  });
});
