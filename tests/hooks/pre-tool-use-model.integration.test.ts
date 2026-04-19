/**
 * Integration tests for MOB-1011 — model validation in handlePreToolUse.
 *
 * Strategy:
 * - Mock TraceWriter so no disk I/O is needed.
 * - Mock loadToolsPolicy to always succeed (fail-open, not the subject of these tests).
 * - Validation uses FORJA_MODEL vs FORJA_EXPECTED_MODEL env vars — no file reads in the hook.
 * - Mock process.exit so it throws instead of terminating the test runner.
 * - Test the model validation branch in handlePreToolUse:
 *   - When FORJA_EXPECTED_MODEL is not set → skip model check entirely (fail-open)
 *   - When FORJA_MODEL matches FORJA_EXPECTED_MODEL → pass through
 *   - When FORJA_MODEL does NOT match FORJA_EXPECTED_MODEL → block (exit 2) with JSON to stderr
 *   - When FORJA_MODEL is unset but FORJA_EXPECTED_MODEL is set → block (model absent)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { ToolsPolicy } from '../../src/policy/tools-policy.js';

// ---------------------------------------------------------------------------
// Mocks — declared before imports so vi.mock hoisting works
// ---------------------------------------------------------------------------

const mockWrite = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/trace/writer.js', () => {
  const TraceWriter = vi.fn().mockImplementation(() => ({ write: mockWrite }));
  return { TraceWriter };
});

// Allow all tools in all phases (not the subject of these tests)
const mockLoadToolsPolicy = vi.fn<() => Promise<ToolsPolicy>>();
const mockIsToolAllowed = vi.fn<() => boolean>().mockReturnValue(true);
vi.mock('../../src/policy/tools-policy.js', () => ({
  loadToolsPolicy: (...args: unknown[]) => mockLoadToolsPolicy(...(args as [])),
  isToolAllowed: (...args: unknown[]) => mockIsToolAllowed(...(args as [])),
}));

// Lazy import after mocks are in place
const { handlePreToolUse } = await import('../../src/hooks/pre-tool-use.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STUB_TOOLS_POLICY: ToolsPolicy = {
  version: '1',
  phases: {
    develop: { allow: '*' },
    test: { allow: '*' },
    security: { allow: '*' },
  },
};

function makePayload(toolName = 'Read'): Record<string, unknown> {
  return { tool_name: toolName };
}

// ---------------------------------------------------------------------------
// Env management
// ---------------------------------------------------------------------------

const ENV_VARS = [
  'FORJA_RUN_ID',
  'FORJA_PHASE',
  'FORJA_PHASE_ID',
  'FORJA_AGENT_ID',
  'FORJA_SPAN_ID',
  'FORJA_MODEL',
  'FORJA_EXPECTED_MODEL',
];

let processExitSpy: ReturnType<typeof vi.spyOn>;
let stderrWriteSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

function setValidRunEnv(phase: string, model?: string, expectedModel?: string): string {
  const runId = randomUUID();
  process.env.FORJA_RUN_ID = runId;
  process.env.FORJA_PHASE = phase;
  process.env.FORJA_PHASE_ID = randomUUID();
  process.env.FORJA_AGENT_ID = randomUUID();
  if (model !== undefined) {
    process.env.FORJA_MODEL = model;
  }
  if (expectedModel !== undefined) {
    process.env.FORJA_EXPECTED_MODEL = expectedModel;
  }
  return runId;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockLoadToolsPolicy.mockResolvedValue(STUB_TOOLS_POLICY);
  mockIsToolAllowed.mockReturnValue(true);

  processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
    throw new Error(`process.exit(${code})`);
  });

  stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  for (const v of ENV_VARS) delete process.env[v];
  processExitSpy.mockRestore();
  stderrWriteSpy.mockRestore();
  stdoutWriteSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// 1. FORJA_EXPECTED_MODEL not set — model check is skipped entirely (fail-open)
// ---------------------------------------------------------------------------

describe('handlePreToolUse — FORJA_MODEL not set skips model validation', () => {
  it('resolves without calling process.exit when FORJA_MODEL is absent', async () => {
    setValidRunEnv('develop'); // no model arg, no expected model
    delete process.env.FORJA_MODEL;
    delete process.env.FORJA_EXPECTED_MODEL;

    await expect(handlePreToolUse(makePayload())).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does not call loadModelsPolicy when FORJA_MODEL is absent', async () => {
    setValidRunEnv('develop');
    delete process.env.FORJA_MODEL;
    delete process.env.FORJA_EXPECTED_MODEL;

    // The hook uses env vars only — no policy file read happens regardless
    await handlePreToolUse(makePayload());
    // No assertion on loadModelsPolicy since it is not imported by the hook anymore
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does not write to stderr when FORJA_MODEL is absent', async () => {
    setValidRunEnv('develop');
    delete process.env.FORJA_MODEL;
    delete process.env.FORJA_EXPECTED_MODEL;

    await handlePreToolUse(makePayload());
    const stderr = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderr).not.toContain('requires model');
  });
});

// ---------------------------------------------------------------------------
// 2. FORJA_MODEL matches FORJA_EXPECTED_MODEL — pass through
// ---------------------------------------------------------------------------

describe('handlePreToolUse — FORJA_MODEL matches pinned model, passes through', () => {
  it('resolves without blocking when model matches the develop phase model', async () => {
    setValidRunEnv('develop', 'claude-sonnet-4-6', 'claude-sonnet-4-6');

    await expect(handlePreToolUse(makePayload())).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('resolves without blocking when model matches the homolog phase model', async () => {
    setValidRunEnv('homolog', 'claude-haiku-4-5', 'claude-haiku-4-5');

    await expect(handlePreToolUse(makePayload())).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('resolves without blocking when model matches the spec phase model', async () => {
    setValidRunEnv('spec', 'claude-opus-4-7', 'claude-opus-4-7');

    await expect(handlePreToolUse(makePayload())).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('records the model in the trace event payload when model matches', async () => {
    setValidRunEnv('develop', 'claude-sonnet-4-6', 'claude-sonnet-4-6');

    await handlePreToolUse(makePayload('Bash'));

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.model).toBe('claude-sonnet-4-6');
  });

  it('does not write a block JSON to stderr when model matches', async () => {
    setValidRunEnv('develop', 'claude-sonnet-4-6', 'claude-sonnet-4-6');

    await handlePreToolUse(makePayload());
    const stderr = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderr).not.toContain('requires model');
  });
});

// ---------------------------------------------------------------------------
// 3. FORJA_MODEL does NOT match FORJA_EXPECTED_MODEL — block
// ---------------------------------------------------------------------------

describe('handlePreToolUse — FORJA_MODEL mismatch blocks execution', () => {
  it('throws (process.exit 2) when actual model differs from pinned develop model', async () => {
    setValidRunEnv('develop', 'claude-haiku-4-5', 'claude-sonnet-4-6');

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');
    expect(processExitSpy).toHaveBeenCalledWith(2);
  });

  it('throws (process.exit 2) when actual model differs from pinned homolog model', async () => {
    setValidRunEnv('homolog', 'claude-opus-4-7', 'claude-haiku-4-5');

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');
    expect(processExitSpy).toHaveBeenCalledWith(2);
  });

  it('writes a JSON block message to stderr on model mismatch', async () => {
    setValidRunEnv('develop', 'claude-haiku-4-5', 'claude-sonnet-4-6');

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');

    const stderrOutput = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    const blockLine = stderrOutput.split('\n').find((l) => l.trim().startsWith('{'));
    expect(blockLine).toBeDefined();
    const parsed = JSON.parse(blockLine!);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('develop');
    expect(parsed.reason).toContain('claude-sonnet-4-6');
    expect(parsed.reason).toContain('claude-haiku-4-5');
  });

  it('block reason mentions the expected model name', async () => {
    setValidRunEnv('develop', 'claude-haiku-4-5', 'claude-sonnet-4-6');

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');

    const stderrOutput = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('claude-sonnet-4-6'); // expected
  });

  it('block reason mentions the actual (wrong) model name', async () => {
    setValidRunEnv('develop', 'claude-haiku-4-5', 'claude-sonnet-4-6');

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');

    const stderrOutput = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('claude-haiku-4-5'); // actual (wrong)
  });

  it('block reason mentions FORJA_MODEL env var hint', async () => {
    setValidRunEnv('develop', 'claude-haiku-4-5', 'claude-sonnet-4-6');

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');

    const stderrOutput = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('FORJA_MODEL');
  });

  it('writes a trace event before the model block (audit trail preserved)', async () => {
    setValidRunEnv('develop', 'claude-haiku-4-5', 'claude-sonnet-4-6');

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');
    // Trace write happens BEFORE process.exit so the blocked event is auditable
    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.blockedReason).toBe('model_mismatch');
    expect(event.payload.allowed).toBe(false);
  });

  it('blocks when FORJA_MODEL is unset but FORJA_EXPECTED_MODEL is set', async () => {
    // FORJA_EXPECTED_MODEL is set but FORJA_MODEL is absent — enforcement applies
    setValidRunEnv('develop', undefined, 'claude-sonnet-4-6');
    delete process.env.FORJA_MODEL;

    await expect(handlePreToolUse(makePayload())).rejects.toThrow('process.exit(2)');
    const stderrOutput = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('FORJA_MODEL is not set');
  });
});

// ---------------------------------------------------------------------------
// 4. FORJA_EXPECTED_MODEL not set for phase — pass through regardless of FORJA_MODEL
// ---------------------------------------------------------------------------

describe('handlePreToolUse — phase not in models policy, no model block', () => {
  it('resolves without blocking when FORJA_EXPECTED_MODEL is not set', async () => {
    // No FORJA_EXPECTED_MODEL → hook treats phase as unpinned, skips enforcement
    setValidRunEnv('perf', 'claude-haiku-4-5');
    delete process.env.FORJA_EXPECTED_MODEL;

    await expect(handlePreToolUse(makePayload())).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does not block for an unknown phase even when FORJA_MODEL is set to an arbitrary value', async () => {
    setValidRunEnv('new_future_phase', 'claude-sonnet-4-6');
    delete process.env.FORJA_EXPECTED_MODEL;

    await expect(handlePreToolUse(makePayload())).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Model is recorded in trace event payload
// ---------------------------------------------------------------------------

describe('handlePreToolUse — model is recorded in trace event', () => {
  it('includes model in trace event payload when FORJA_MODEL matches', async () => {
    setValidRunEnv('develop', 'claude-sonnet-4-6', 'claude-sonnet-4-6');

    await handlePreToolUse(makePayload('Read'));

    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.model).toBe('claude-sonnet-4-6');
  });

  it('records model=undefined in trace event when FORJA_MODEL is not set', async () => {
    setValidRunEnv('develop');
    delete process.env.FORJA_MODEL;
    delete process.env.FORJA_EXPECTED_MODEL;

    await handlePreToolUse(makePayload('Read'));

    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.model).toBeUndefined();
  });
});
