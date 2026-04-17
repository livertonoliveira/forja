/**
 * E2E tests for MOB-992 — full pipeline simulation of the PostToolUse hook.
 *
 * Simulates a realistic run where handlePostToolUse is called multiple times
 * across different pipeline phases (as the harness would call it), then
 * verifies the cost report matches expectations.
 *
 * These tests exercise the entire chain:
 *   stdin payload → handlePostToolUse → TraceWriter → CostAccumulator → CostReporter
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { handlePostToolUse } from '../../src/hooks/post-tool-use.js';
import { CostAccumulator } from '../../src/cost/accumulator.js';
import { CostReporter } from '../../src/cost/reporter.js';
import { TraceEventSchema } from '../../src/schemas/index.js';

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

function tracePath(runId: string): string {
  return path.join(runDir(runId), 'trace.jsonl');
}

function costPath(runId: string): string {
  return path.join(runDir(runId), 'cost.jsonl');
}

afterEach(async () => {
  for (const runId of createdRunIds.splice(0)) {
    try {
      await fs.rm(runDir(runId), { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  delete process.env.FORJA_RUN_ID;
  delete process.env.FORJA_PHASE;
  delete process.env.FORJA_PHASE_ID;
  delete process.env.FORJA_AGENT_ID;
  delete process.env.FORJA_SPAN_ID;
  delete process.env.FORJA_MODEL;
});

// ---------------------------------------------------------------------------
// Scenario 1: full pipeline — develop + test + review phases
// ---------------------------------------------------------------------------

describe('E2E: full pipeline run with 3 phases', () => {
  it('emits cost events per phase, trace lines validate, total == phase sum', async () => {
    const runId = makeRunId();
    const phases = [
      { name: 'develop', tokensIn: 10_000, tokensOut: 5_000, model: 'claude-opus-4-7' },
      { name: 'test', tokensIn: 5_000, tokensOut: 2_500, model: 'claude-sonnet-4-6' },
      { name: 'review', tokensIn: 3_000, tokensOut: 1_000, model: 'claude-haiku-4-5' },
    ];

    // Simulate the harness firing hook for each phase
    for (const { name, tokensIn, tokensOut, model } of phases) {
      process.env.FORJA_RUN_ID = runId;
      process.env.FORJA_PHASE = name;
      process.env.FORJA_MODEL = model;
      process.env.FORJA_PHASE_ID = randomUUID();
      process.env.FORJA_AGENT_ID = randomUUID();
      process.env.FORJA_SPAN_ID = randomUUID();

      await handlePostToolUse({ usage: { input_tokens: tokensIn, output_tokens: tokensOut } });
    }

    // 1. cost.jsonl exists and each line is valid JSON
    const raw = await fs.readFile(costPath(runId), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // 2. total == sum of phase usd via accumulator
    const acc = new CostAccumulator();
    const { totalUsd, byPhase } = await acc.getTotal(runId);
    expect(totalUsd).toBeGreaterThan(0);
    expect(Object.keys(byPhase)).toHaveLength(3);
    const phaseSum = Object.values(byPhase).reduce((s, p) => s + p.usd, 0);
    expect(totalUsd).toBeCloseTo(phaseSum, 6);

    // 3. trace.jsonl has 3 cost event lines, all valid
    const traceRaw = await fs.readFile(tracePath(runId), 'utf8');
    const traceLines = traceRaw.split('\n').filter((l) => l.trim());
    expect(traceLines).toHaveLength(3);
    for (const line of traceLines) {
      const event = JSON.parse(line);
      expect(() => TraceEventSchema.parse(event)).not.toThrow();
      expect(event.eventType).toBe('cost');
    }

    // 4. CostReporter shows all 3 phases
    const reporter = new CostReporter();
    const report = await reporter.format(runId);
    expect(report).toContain('develop');
    expect(report).toContain('test');
    expect(report).toContain('review');
    expect(report).toContain('Total:');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: multiple hook calls within same phase (e.g. develop)
// ---------------------------------------------------------------------------

describe('E2E: multiple hook calls within the same phase', () => {
  it('accumulates tokens and cost correctly across 5 tool calls', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';
    process.env.FORJA_PHASE_ID = randomUUID();
    process.env.FORJA_AGENT_ID = randomUUID();

    const calls = [
      { input_tokens: 1000, output_tokens: 500 },
      { input_tokens: 2000, output_tokens: 800 },
      { input_tokens: 500, output_tokens: 200 },
      { input_tokens: 3000, output_tokens: 1200 },
      { input_tokens: 800, output_tokens: 300 },
    ];

    for (const usage of calls) {
      await handlePostToolUse({ usage });
    }

    const acc = new CostAccumulator();
    const { totalUsd, byPhase } = await acc.getTotal(runId);

    const expectedTokens = calls.reduce((s, c) => s + c.input_tokens + c.output_tokens, 0);
    expect(byPhase['develop'].tokens).toBe(expectedTokens);
    expect(totalUsd).toBeCloseTo(byPhase['develop'].usd, 6);

    // trace must have 5 lines
    const traceRaw = await fs.readFile(tracePath(runId), 'utf8');
    const lines = traceRaw.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: invalid payloads mixed with valid ones
// ---------------------------------------------------------------------------

describe('E2E: resilience — invalid payloads do not break valid ones', () => {
  it('skips invalid payloads and only records valid cost events', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';

    // 1 invalid, 1 valid, 1 invalid, 1 valid
    await handlePostToolUse({});                                         // missing usage
    await handlePostToolUse({ usage: { input_tokens: 100, output_tokens: 50 } }); // valid
    await handlePostToolUse({ usage: null });                            // invalid
    await handlePostToolUse({ usage: { input_tokens: 200, output_tokens: 100 } }); // valid

    const acc = new CostAccumulator();
    const { totalUsd, byPhase } = await acc.getTotal(runId);

    // Only 2 valid events recorded
    expect(byPhase['develop'].tokens).toBe(450); // (100+50) + (200+100)
    expect(totalUsd).toBeGreaterThan(0);

    // trace must have exactly 2 lines
    const traceRaw = await fs.readFile(tracePath(runId), 'utf8');
    const lines = traceRaw.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: missing FORJA_RUN_ID never creates files
// ---------------------------------------------------------------------------

describe('E2E: missing FORJA_RUN_ID produces no artifacts', () => {
  it('does not create cost.json or trace.jsonl when FORJA_RUN_ID is absent', async () => {
    const runId = makeRunId(); // just used to check the dir was NOT created
    delete process.env.FORJA_RUN_ID;
    process.env.FORJA_PHASE = 'develop';

    await handlePostToolUse({ usage: { input_tokens: 100, output_tokens: 50 } });

    // Neither file should exist
    await expect(fs.access(costPath(runId))).rejects.toThrow();
    await expect(fs.access(tracePath(runId))).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: CostReporter shows correct USD per phase in report
// ---------------------------------------------------------------------------

describe('E2E: forja cost --run report shows USD per phase', () => {
  it('report contains $X.XXXX and token count for each phase', async () => {
    const runId = makeRunId();

    // Simulate 2 phases
    for (const [phase, model] of [['develop', 'claude-sonnet-4-6'], ['test', 'claude-haiku-4-5']]) {
      process.env.FORJA_RUN_ID = runId;
      process.env.FORJA_PHASE = phase;
      process.env.FORJA_MODEL = model;
      await handlePostToolUse({ usage: { input_tokens: 1000, output_tokens: 500 } });
    }

    const reporter = new CostReporter();
    const output = await reporter.format(runId);

    // Must have dollar amounts formatted to 4 decimals
    const dollarMatches = output.match(/\$\d+\.\d{4}/g);
    expect(dollarMatches).not.toBeNull();
    expect(dollarMatches!.length).toBeGreaterThanOrEqual(3); // total + 2 phases

    // Must have token annotations
    expect(output.match(/tokens/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
