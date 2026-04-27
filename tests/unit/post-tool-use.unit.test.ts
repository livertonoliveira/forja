import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Mocks — declared before imports so vi.mock hoisting works
// ---------------------------------------------------------------------------

vi.mock('../../src/trace/dual-writer.js', () => {
  const writeCostEvent = vi.fn().mockResolvedValue(undefined);
  const DualWriter = vi.fn().mockImplementation(function() { return { writeCostEvent }; });
  return { DualWriter };
});

vi.mock('../../src/store/index.js', () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const insertCostEvent = vi.fn().mockResolvedValue(undefined);
  const createStore = vi.fn().mockReturnValue({ close, insertCostEvent });
  return { createStore };
});

vi.mock('../../src/config/loader.js', () => {
  const loadConfig = vi.fn().mockResolvedValue({ storeUrl: '', projectId: 'test-project', source: 'default' });
  const clearConfigCache = vi.fn();
  return { loadConfig, clearConfigCache };
});

// ---------------------------------------------------------------------------
// Lazy imports after mocks are in place
// ---------------------------------------------------------------------------

const { handlePostToolUse } = await import('../../src/hooks/post-tool-use.js');
const { DualWriter } = await import('../../src/trace/dual-writer.js');
const { createStore } = await import('../../src/store/index.js');
const { loadConfig } = await import('../../src/config/loader.js');
const mockLoadConfig = vi.mocked(loadConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_RUN_ID = randomUUID();

/** Minimal valid payload with usage */
function makePayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
    ...overrides,
  };
}

/** Run-directory path for cost.jsonl */
function costPath(runId: string): string {
  return path.join('forja', 'state', 'runs', runId, 'cost.jsonl');
}

async function cleanupRun(runId: string): Promise<void> {
  try {
    await fs.rm(path.join('forja', 'state', 'runs', runId), { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

const originalEnv: Record<string, string | undefined> = {};
const createdRunIds: string[] = [];

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    originalEnv[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  // Sync loadConfig mock with DATABASE_URL for backward-compat with these tests
  const dbUrl = vars['DATABASE_URL'];
  if (dbUrl !== undefined) {
    mockLoadConfig.mockResolvedValue({
      storeUrl: dbUrl ?? '',
      source: dbUrl ? 'env' : 'default',
    });
  }
}

function restoreEnv(): void {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  // clear tracked originals
  for (const k of Object.keys(originalEnv)) {
    delete originalEnv[k];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  restoreEnv();
  await Promise.all(createdRunIds.splice(0).map(cleanupRun));
});

// ---------------------------------------------------------------------------
// 1. Missing usage field — skip gracefully, no crash
// ---------------------------------------------------------------------------

describe('handlePostToolUse — missing usage field', () => {
  it('returns without writing anything when usage is absent', async () => {
    setEnv({ FORJA_RUN_ID: VALID_RUN_ID, DATABASE_URL: undefined });

    await expect(handlePostToolUse({})).resolves.toBeUndefined();
    expect(createStore).not.toHaveBeenCalled();
    expect(DualWriter).not.toHaveBeenCalled();
  });

  it('returns without writing when input_tokens is missing', async () => {
    setEnv({ FORJA_RUN_ID: VALID_RUN_ID, DATABASE_URL: undefined });

    await expect(
      handlePostToolUse({ usage: { output_tokens: 50 } }),
    ).resolves.toBeUndefined();
    expect(createStore).not.toHaveBeenCalled();
  });

  it('returns without writing when output_tokens is missing', async () => {
    setEnv({ FORJA_RUN_ID: VALID_RUN_ID, DATABASE_URL: undefined });

    await expect(
      handlePostToolUse({ usage: { input_tokens: 100 } }),
    ).resolves.toBeUndefined();
    expect(createStore).not.toHaveBeenCalled();
  });

  it('returns without writing when usage tokens are non-numbers', async () => {
    setEnv({ FORJA_RUN_ID: VALID_RUN_ID, DATABASE_URL: undefined });

    await expect(
      handlePostToolUse({ usage: { input_tokens: 'abc', output_tokens: 'xyz' } }),
    ).resolves.toBeUndefined();
    expect(createStore).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Missing FORJA_RUN_ID — skip gracefully
// ---------------------------------------------------------------------------

describe('handlePostToolUse — missing FORJA_RUN_ID', () => {
  it('skips when FORJA_RUN_ID is not set', async () => {
    setEnv({ FORJA_RUN_ID: undefined, DATABASE_URL: undefined });

    await expect(handlePostToolUse(makePayload())).resolves.toBeUndefined();
    expect(createStore).not.toHaveBeenCalled();
    expect(DualWriter).not.toHaveBeenCalled();
  });

  it('skips when FORJA_RUN_ID is not a valid UUID', async () => {
    setEnv({ FORJA_RUN_ID: 'not-a-uuid', DATABASE_URL: undefined });

    await expect(handlePostToolUse(makePayload())).resolves.toBeUndefined();
    expect(createStore).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. No DATABASE_URL — JSONL-only path (TraceWriter, no DualWriter)
// ---------------------------------------------------------------------------

describe('handlePostToolUse — no DATABASE_URL (JSONL only)', () => {
  it('does NOT create a store or DualWriter when DATABASE_URL is absent', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: undefined });

    await handlePostToolUse(makePayload());

    expect(createStore).not.toHaveBeenCalled();
    expect(DualWriter).not.toHaveBeenCalled();
  });

  it('writes cost.jsonl when DATABASE_URL is absent', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: undefined, FORJA_PHASE: 'develop' });

    await handlePostToolUse(makePayload());

    const raw = await fs.readFile(costPath(runId), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({
      phase: 'develop',
      tokensIn: 100,
      tokensOut: 50,
    });
    expect(typeof entry.costUsd).toBe('number');
  });

  it('resolves without throwing even if payload is null', async () => {
    setEnv({ FORJA_RUN_ID: VALID_RUN_ID, DATABASE_URL: undefined });
    await expect(handlePostToolUse(null)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. DATABASE_URL set — DualWriter path
// ---------------------------------------------------------------------------

describe('handlePostToolUse — with DATABASE_URL (DualWriter)', () => {
  it('creates a store and DualWriter when DATABASE_URL is set', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: 'postgres://localhost/test' });

    await handlePostToolUse(makePayload());

    expect(createStore).toHaveBeenCalledWith('postgres://localhost/test', { max: 1, idleTimeoutMillis: 0 });
    expect(DualWriter).toHaveBeenCalledOnce();
  });

  it('calls dualWriter.writeCostEvent with a valid CostEvent', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({
      FORJA_RUN_ID: runId,
      DATABASE_URL: 'postgres://localhost/test',
      FORJA_MODEL: 'claude-haiku-4-5',
    });

    await handlePostToolUse(makePayload());

    const mockInstance = vi.mocked(DualWriter).mock.results[0].value as {
      writeCostEvent: ReturnType<typeof vi.fn>;
    };
    expect(mockInstance.writeCostEvent).toHaveBeenCalledOnce();
    const [event] = mockInstance.writeCostEvent.mock.calls[0];
    expect(event).toMatchObject({
      runId,
      model: 'claude-haiku-4-5',
      tokensIn: 100,
      tokensOut: 50,
    });
    expect(typeof event.costUsd).toBe('number');
  });

  it('reuses the store singleton across invocations (createStore called once per URL)', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: 'postgres://localhost/test' });

    const callsBefore = vi.mocked(createStore).mock.calls.length;
    await handlePostToolUse(makePayload());
    await handlePostToolUse(makePayload());

    const callsAfter = vi.mocked(createStore).mock.calls.length;
    // createStore should be called at most once for the same URL (singleton pattern)
    expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
  });

  it('still writes cost.jsonl when DualWriter is used', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({
      FORJA_RUN_ID: runId,
      DATABASE_URL: 'postgres://localhost/test',
      FORJA_PHASE: 'security',
    });

    await handlePostToolUse(makePayload());

    const raw = await fs.readFile(costPath(runId), 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.phase).toBe('security');
  });
});

// ---------------------------------------------------------------------------
// 5. DATABASE_URL set but DualWriter throws (simulates PG error)
// ---------------------------------------------------------------------------

describe('handlePostToolUse — DualWriter PG failure falls back gracefully', () => {
  it('does not throw when dualWriter.writeCostEvent rejects', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: 'postgres://bad-host/test' });

    // Make writeCostEvent reject this time
    vi.mocked(DualWriter).mockImplementationOnce(function() { return {
      writeCostEvent: vi.fn().mockRejectedValue(new Error('Connection refused')),
    }; });

    // Promise.allSettled in the hook ensures this resolves even if PG fails
    await expect(handlePostToolUse(makePayload())).resolves.toBeUndefined();
  });

  it('still writes cost.jsonl even when the DB write fails', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: 'postgres://bad-host/test' });

    vi.mocked(DualWriter).mockImplementationOnce(function() { return {
      writeCostEvent: vi.fn().mockRejectedValue(new Error('Connection refused')),
    }; });

    await handlePostToolUse(makePayload());

    const raw = await fs.readFile(costPath(runId), 'utf8');
    expect(raw.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Cost calculation
// ---------------------------------------------------------------------------

describe('handlePostToolUse — cost calculation', () => {
  it('calculates costUsd correctly for claude-sonnet-4-6 (default)', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: undefined, FORJA_MODEL: 'claude-sonnet-4-6' });

    // 1M tokens in = $3, 1M tokens out = $15
    // 1000 in + 500 out → (1000/1e6)*3 + (500/1e6)*15 = 0.003 + 0.0075 = 0.0105
    await handlePostToolUse({ usage: { input_tokens: 1000, output_tokens: 500 } });

    const raw = await fs.readFile(costPath(runId), 'utf8');
    const entry = JSON.parse(raw.trim());
    expect(entry.costUsd).toBeCloseTo(0.0105, 6);
  });

  it('falls back to sonnet pricing for unknown models', async () => {
    const runId = randomUUID();
    createdRunIds.push(runId);
    setEnv({ FORJA_RUN_ID: runId, DATABASE_URL: undefined, FORJA_MODEL: 'claude-unknown-99' });

    await handlePostToolUse({ usage: { input_tokens: 1000, output_tokens: 500 } });

    const raw = await fs.readFile(costPath(runId), 'utf8');
    const entry = JSON.parse(raw.trim());
    expect(entry.costUsd).toBeCloseTo(0.0105, 6); // same as sonnet
  });
});
