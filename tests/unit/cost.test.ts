/**
 * Unit tests for MOB-992 — token cost accounting via PostToolUse hook.
 *
 * Covers:
 *  - CostAccumulator.record / getTotal / flush
 *  - CostReporter.format output shape
 *  - handlePostToolUse happy path, missing usage field, missing FORJA_RUN_ID
 *  - Price constants (opus / sonnet / haiku)
 *  - Total cost equals sum of phase costs
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import { CostAccumulator } from '../../src/cost/accumulator.js';
import { CostReporter } from '../../src/cost/reporter.js';
import { handlePostToolUse } from '../../src/hooks/post-tool-use.js';
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

async function cleanupRun(runId: string): Promise<void> {
  try {
    await fs.rm(runDir(runId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function makeValidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    usage: {
      input_tokens: 100,
      output_tokens: 200,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(async () => {
  await Promise.all(createdRunIds.splice(0).map(cleanupRun));
  // Restore env vars
  delete process.env.FORJA_RUN_ID;
  delete process.env.FORJA_PHASE;
  delete process.env.FORJA_PHASE_ID;
  delete process.env.FORJA_AGENT_ID;
  delete process.env.FORJA_SPAN_ID;
  delete process.env.FORJA_MODEL;
});

// ---------------------------------------------------------------------------
// CostEventSchema
// ---------------------------------------------------------------------------

describe('CostEventSchema', () => {
  it('accepts a fully valid event', () => {
    const event = {
      id: randomUUID(),
      runId: randomUUID(),
      phaseId: randomUUID(),
      agentId: randomUUID(),
      model: 'claude-sonnet-4-6',
      tokensIn: 100,
      tokensOut: 200,
      costUsd: 0.0003,
      createdAt: new Date().toISOString(),
    };
    expect(() => CostEventSchema.parse(event)).not.toThrow();
  });

  it('rejects non-integer tokensIn', () => {
    const event = {
      id: randomUUID(),
      runId: randomUUID(),
      phaseId: randomUUID(),
      agentId: randomUUID(),
      model: 'claude-sonnet-4-6',
      tokensIn: 1.5,
      tokensOut: 200,
      costUsd: 0.0003,
      createdAt: new Date().toISOString(),
    };
    expect(() => CostEventSchema.parse(event)).toThrow();
  });

  it('rejects non-UUID id', () => {
    const event = {
      id: 'not-a-uuid',
      runId: randomUUID(),
      phaseId: randomUUID(),
      agentId: randomUUID(),
      model: 'claude-sonnet-4-6',
      tokensIn: 100,
      tokensOut: 200,
      costUsd: 0.0003,
      createdAt: new Date().toISOString(),
    };
    expect(() => CostEventSchema.parse(event)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CostAccumulator — record
// ---------------------------------------------------------------------------

describe('CostAccumulator.record', () => {
  it('creates cost.jsonl with correct totalUsd after one record', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const accumulator = new CostAccumulator();
    const event = CostEventSchema.parse({
      id: randomUUID(),
      runId,
      phaseId: randomUUID(),
      agentId: randomUUID(),
      model: 'claude-sonnet-4-6',
      tokensIn: 1_000_000,
      tokensOut: 0,
      costUsd: 3,
      createdAt: new Date().toISOString(),
    });

    await accumulator.record(event);

    const { totalUsd, byPhase } = await accumulator.getTotal(runId);
    expect(totalUsd).toBeCloseTo(3, 6);
    expect(byPhase['develop'].usd).toBeCloseTo(3, 6);
    expect(byPhase['develop'].tokens).toBe(1_000_000);
    // file must exist
    await expect(fs.access(costPath(runId))).resolves.toBeUndefined();
  });

  it('accumulates multiple records in the same phase', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'test';

    const accumulator = new CostAccumulator();
    const makeEvent = (tokensIn: number, tokensOut: number, costUsd: number) =>
      CostEventSchema.parse({
        id: randomUUID(),
        runId,
        phaseId: randomUUID(),
        agentId: randomUUID(),
        model: 'claude-haiku-4-5',
        tokensIn,
        tokensOut,
        costUsd,
        createdAt: new Date().toISOString(),
      });

    await accumulator.record(makeEvent(100, 50, 0.0001));
    await accumulator.record(makeEvent(200, 100, 0.0002));

    const { totalUsd, byPhase } = await accumulator.getTotal(runId);
    expect(totalUsd).toBeCloseTo(0.0003, 6);
    expect(byPhase['test'].tokens).toBe(450); // 100+50 + 200+100
  });

  it('separates costs by phase', async () => {
    const runId = makeRunId();
    const accumulator = new CostAccumulator();

    process.env.FORJA_PHASE = 'develop';
    await accumulator.record(CostEventSchema.parse({
      id: randomUUID(), runId,
      phaseId: randomUUID(), agentId: randomUUID(),
      model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 0, costUsd: 0.001,
      createdAt: new Date().toISOString(),
    }));

    process.env.FORJA_PHASE = 'test';
    await accumulator.record(CostEventSchema.parse({
      id: randomUUID(), runId,
      phaseId: randomUUID(), agentId: randomUUID(),
      model: 'claude-sonnet-4-6', tokensIn: 200, tokensOut: 0, costUsd: 0.002,
      createdAt: new Date().toISOString(),
    }));

    const { totalUsd, byPhase } = await accumulator.getTotal(runId);
    expect(totalUsd).toBeCloseTo(0.003, 6);
    expect(Object.keys(byPhase)).toContain('develop');
    expect(Object.keys(byPhase)).toContain('test');
  });

  it('total cost equals sum of phase costs', async () => {
    const runId = makeRunId();
    const accumulator = new CostAccumulator();

    const phases = ['develop', 'test', 'review'];
    let expectedTotal = 0;

    for (let i = 0; i < phases.length; i++) {
      process.env.FORJA_PHASE = phases[i];
      const costUsd = (i + 1) * 0.001;
      expectedTotal += costUsd;
      await accumulator.record(CostEventSchema.parse({
        id: randomUUID(), runId,
        phaseId: randomUUID(), agentId: randomUUID(),
        model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 0, costUsd,
        createdAt: new Date().toISOString(),
      }));
    }

    const { totalUsd, byPhase } = await accumulator.getTotal(runId);
    const phaseSum = Object.values(byPhase).reduce((sum, p) => sum + p.usd, 0);

    expect(totalUsd).toBeCloseTo(expectedTotal, 6);
    expect(totalUsd).toBeCloseTo(phaseSum, 6);
  });
});

// ---------------------------------------------------------------------------
// CostAccumulator — getTotal on missing run
// ---------------------------------------------------------------------------

describe('CostAccumulator.getTotal', () => {
  it('returns zero totals for a run that has never been written', async () => {
    const runId = makeRunId();
    const accumulator = new CostAccumulator();
    const { totalUsd, byPhase } = await accumulator.getTotal(runId);
    expect(totalUsd).toBe(0);
    expect(byPhase).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// CostAccumulator — flush
// ---------------------------------------------------------------------------

describe('CostAccumulator.flush', () => {
  it('flush does not throw for a run with no prior records', async () => {
    const runId = makeRunId();
    const accumulator = new CostAccumulator();
    await expect(accumulator.flush(runId)).resolves.toBeUndefined();
  });

  it('writes atomically — no .tmp file remains after flush', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const accumulator = new CostAccumulator();
    await accumulator.record(CostEventSchema.parse({
      id: randomUUID(), runId,
      phaseId: randomUUID(), agentId: randomUUID(),
      model: 'claude-sonnet-4-6', tokensIn: 1, tokensOut: 1, costUsd: 0.000001,
      createdAt: new Date().toISOString(),
    }));

    const tmpFile = path.join(runDir(runId), '.cost.json.tmp');
    await expect(fs.access(tmpFile)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CostReporter.format
// ---------------------------------------------------------------------------

describe('CostReporter.format', () => {
  it('returns a string containing the run short id and total USD', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const accumulator = new CostAccumulator();
    await accumulator.record(CostEventSchema.parse({
      id: randomUUID(), runId,
      phaseId: randomUUID(), agentId: randomUUID(),
      model: 'claude-sonnet-4-6', tokensIn: 1000, tokensOut: 500, costUsd: 0.0105,
      createdAt: new Date().toISOString(),
    }));

    const reporter = new CostReporter();
    const output = await reporter.format(runId);

    expect(output).toContain(runId.slice(0, 8));
    expect(output).toContain('Total:');
    expect(output).toContain('$');
  });

  it('includes one line per phase', async () => {
    const runId = makeRunId();
    const accumulator = new CostAccumulator();

    for (const phase of ['develop', 'test', 'review']) {
      process.env.FORJA_PHASE = phase;
      await accumulator.record(CostEventSchema.parse({
        id: randomUUID(), runId,
        phaseId: randomUUID(), agentId: randomUUID(),
        model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 50, costUsd: 0.001,
        createdAt: new Date().toISOString(),
      }));
    }

    const reporter = new CostReporter();
    const output = await reporter.format(runId);

    expect(output).toContain('develop');
    expect(output).toContain('test');
    expect(output).toContain('review');
    // Also contains "(N tokens)" for each phase
    expect(output.match(/tokens/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('formats cost to 4 decimal places', async () => {
    const runId = makeRunId();
    process.env.FORJA_PHASE = 'develop';

    const accumulator = new CostAccumulator();
    await accumulator.record(CostEventSchema.parse({
      id: randomUUID(), runId,
      phaseId: randomUUID(), agentId: randomUUID(),
      model: 'claude-sonnet-4-6', tokensIn: 1, tokensOut: 1, costUsd: 0.000018,
      createdAt: new Date().toISOString(),
    }));

    const reporter = new CostReporter();
    const output = await reporter.format(runId);

    // Should contain a 4-decimal number like $0.0000
    expect(output).toMatch(/\$\d+\.\d{4}/);
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — happy path
// ---------------------------------------------------------------------------

describe('handlePostToolUse — happy path', () => {
  it('writes a cost event to trace and updates cost.jsonl', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';

    const payload = makeValidPayload({ usage: { input_tokens: 500, output_tokens: 200 } });
    await handlePostToolUse(payload);

    const acc = new CostAccumulator();
    const { totalUsd, byPhase } = await acc.getTotal(runId);
    expect(totalUsd).toBeGreaterThan(0);
    expect(byPhase['develop'].tokens).toBe(700);
  });

  it('writes a cost event to trace.jsonl', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'test';
    process.env.FORJA_MODEL = 'claude-haiku-4-5';

    await handlePostToolUse(makeValidPayload());

    const tracePath = path.join(runDir(runId), 'trace.jsonl');
    const raw = await fs.readFile(tracePath, 'utf8');
    const lines = raw
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => {
        try { return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header'; } catch { return false; }
      });
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const event = JSON.parse(lines[0]);
    expect(event.eventType).toBe('cost');
    expect(event.payload.phase).toBe('test');
  });

  it('correctly computes cost for claude-opus-4-7 ($15/$75 per MTok)', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-opus-4-7';

    await handlePostToolUse({
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });

    const acc = new CostAccumulator();
    const { totalUsd } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(90, 4);
  });

  it('correctly computes cost for claude-haiku-4-5 ($0.80/$4 per MTok)', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-haiku-4-5';

    await handlePostToolUse({
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });

    const acc = new CostAccumulator();
    const { totalUsd } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(4.8, 4);
  });

  it('falls back to sonnet pricing for unknown model', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-unknown-model';

    await handlePostToolUse({
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });

    const acc = new CostAccumulator();
    const { totalUsd } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(3, 4);
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — cache token pricing
// ---------------------------------------------------------------------------

describe('handlePostToolUse — cache token pricing', () => {
  it('extracts cache_creation_input_tokens and prices them at 1.25× input rate (sonnet)', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';

    // 1M cache-write tokens at $3.75/MTok = $3.75
    await handlePostToolUse({
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 },
    });

    const acc = new CostAccumulator();
    const { totalUsd } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(3.75, 4);
  });

  it('extracts cache_read_input_tokens and prices them at 0.10× input rate (sonnet)', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';

    // 1M cache-read tokens at $0.30/MTok = $0.30
    await handlePostToolUse({
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
    });

    const acc = new CostAccumulator();
    const { totalUsd } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(0.30, 4);
  });

  it('defaults cache token counts to 0 when fields are absent', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';

    // 1M input tokens at $3/MTok = $3.00 — no cache fields
    await handlePostToolUse({
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });

    const acc = new CostAccumulator();
    const { totalUsd, byPhase } = await acc.getTotal(runId);
    expect(totalUsd).toBeCloseTo(3.0, 4);
    expect(byPhase['develop'].cacheCreationTokens).toBe(0);
    expect(byPhase['develop'].cacheReadTokens).toBe(0);
  });

  it('accumulates cache tokens in CostAccumulator.getTotal', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';

    await handlePostToolUse({
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 500_000 },
    });
    await handlePostToolUse({
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 200_000 },
    });

    const acc = new CostAccumulator();
    const { byPhase } = await acc.getTotal(runId);
    expect(byPhase['develop'].cacheCreationTokens).toBe(500_000);
    expect(byPhase['develop'].cacheReadTokens).toBe(200_000);
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — invalid payload (missing usage)
// ---------------------------------------------------------------------------

describe('handlePostToolUse — invalid payload', () => {
  it('returns without throwing when usage field is absent', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';

    // Should not throw and should not create cost.json
    await expect(handlePostToolUse({})).resolves.toBeUndefined();

    // cost.json must NOT exist
    await expect(fs.access(costPath(runId))).rejects.toThrow();
  });

  it('returns without throwing when usage.input_tokens is not a number', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';

    await expect(
      handlePostToolUse({ usage: { input_tokens: 'bad', output_tokens: 100 } }),
    ).resolves.toBeUndefined();
  });

  it('returns without throwing when payload is null', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;

    await expect(handlePostToolUse(null)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — missing FORJA_RUN_ID
// ---------------------------------------------------------------------------

describe('handlePostToolUse — missing FORJA_RUN_ID', () => {
  it('returns without throwing when FORJA_RUN_ID is absent', async () => {
    delete process.env.FORJA_RUN_ID;
    await expect(
      handlePostToolUse(makeValidPayload()),
    ).resolves.toBeUndefined();
  });

  it('returns without throwing when FORJA_RUN_ID is not a valid UUID', async () => {
    process.env.FORJA_RUN_ID = 'not-a-valid-uuid';
    await expect(
      handlePostToolUse(makeValidPayload()),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handlePostToolUse — execution time benchmark
// ---------------------------------------------------------------------------

describe('handlePostToolUse — performance', () => {
  it('executes in under 50ms', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_MODEL = 'claude-sonnet-4-6';

    const start = performance.now();
    await handlePostToolUse(makeValidPayload());
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
