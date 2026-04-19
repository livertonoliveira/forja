/**
 * Integration tests for handlePreToolUse (MOB-1005)
 *
 * Strategy:
 * - Mock TraceWriter so no disk I/O is needed (avoids process.chdir limitations
 *   in vitest --pool=threads).
 * - Mock loadToolsPolicy to control policy content per test group without
 *   depending on a real CWD-relative file path.
 * - Mock process.exit so it throws instead of terminating the test runner.
 * - Spy on process.stdout.write to assert the block JSON output.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { ToolsPolicy } from '../../src/policy/tools-policy.js';

// ---------------------------------------------------------------------------
// Mocks — declared before imports so vi.mock hoisting works
// ---------------------------------------------------------------------------

// Mock TraceWriter: we care about the write calls but not the file system side
const mockWrite = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/trace/writer.js', () => {
  const TraceWriter = vi.fn().mockImplementation(() => ({ write: mockWrite }));
  return { TraceWriter };
});

// Mock tools-policy: lets us inject any policy shape per test without touching disk
const mockLoadToolsPolicy = vi.fn<() => Promise<ToolsPolicy>>();
const mockIsToolAllowed = vi.fn<(toolName: string, phase: string, policy: ToolsPolicy) => boolean>();
vi.mock('../../src/policy/tools-policy.js', () => ({
  loadToolsPolicy: (...args: unknown[]) => mockLoadToolsPolicy(...args as []),
  isToolAllowed: (...args: unknown[]) => mockIsToolAllowed(...(args as [string, string, ToolsPolicy])),
}));

// Lazy import after mocks are in place
const { handlePreToolUse } = await import('../../src/hooks/pre-tool-use.js');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** A minimal realistic policy that mirrors the real policies/tools.yaml */
const REAL_POLICY: ToolsPolicy = {
  version: '1',
  phases: {
    security: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
      allow: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    },
    perf: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
      allow: ['Read', 'Glob', 'Grep'],
    },
    review: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
      allow: ['Read', 'Glob', 'Grep'],
    },
    audit_backend: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
    },
    audit_security: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
    },
    develop: {
      allow: '*',
    },
    test: {
      allow: '*',
    },
  },
};

function makePayload(toolName: string): Record<string, unknown> {
  return { tool_name: toolName };
}

// ---------------------------------------------------------------------------
// Env management
// ---------------------------------------------------------------------------

const ENV_VARS = ['FORJA_RUN_ID', 'FORJA_PHASE', 'FORJA_PHASE_ID', 'FORJA_AGENT_ID', 'FORJA_SPAN_ID'];

let processExitSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;
let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

function setValidRunEnv(phase: string): string {
  const runId = randomUUID();
  process.env.FORJA_RUN_ID = runId;
  process.env.FORJA_PHASE = phase;
  process.env.FORJA_PHASE_ID = randomUUID();
  process.env.FORJA_AGENT_ID = randomUUID();
  return runId;
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: policy loads successfully; isToolAllowed uses the real logic via the policy fixture
  mockLoadToolsPolicy.mockResolvedValue(REAL_POLICY);
  // Default: delegate to the real isToolAllowed logic imported inline
  mockIsToolAllowed.mockImplementation(
    (toolName: string, phase: string, policy: ToolsPolicy): boolean => {
      const phasePolicy = policy.phases[phase];
      if (!phasePolicy) return true;
      const { allow, deny } = phasePolicy;
      if (deny && deny.includes(toolName)) return false;
      if (allow === undefined || allow === '*') return true;
      return (allow as string[]).includes(toolName);
    },
  );

  processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
    throw new Error(`process.exit(${code})`);
  });

  stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  for (const v of ENV_VARS) delete process.env[v];
  processExitSpy.mockRestore();
  stdoutWriteSpy.mockRestore();
  stderrWriteSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// 1. Security phase — Edit is blocked
// ---------------------------------------------------------------------------

describe('handlePreToolUse — security phase blocks Edit', () => {
  it('exits with code 2 when Edit is used in security phase', async () => {
    setValidRunEnv('security');

    await expect(handlePreToolUse(makePayload('Edit'))).rejects.toThrow('process.exit(2)');
    expect(processExitSpy).toHaveBeenCalledWith(2);
  });

  it('writes a block JSON object to stdout', async () => {
    setValidRunEnv('security');

    await expect(handlePreToolUse(makePayload('Edit'))).rejects.toThrow('process.exit(2)');

    const stdoutOutput = stdoutWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    const parsed = JSON.parse(stdoutOutput.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('Edit');
    expect(parsed.reason).toContain('security');
  });

  it('block JSON contains decision and reason keys', async () => {
    setValidRunEnv('security');

    await expect(handlePreToolUse(makePayload('Write'))).rejects.toThrow('process.exit(2)');

    const stdoutOutput = stdoutWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    const parsed = JSON.parse(stdoutOutput.trim());
    expect(Object.keys(parsed)).toContain('decision');
    expect(Object.keys(parsed)).toContain('reason');
  });

  it('writes a tool_call trace event with allowed=false before blocking', async () => {
    setValidRunEnv('security');

    await expect(handlePreToolUse(makePayload('Edit'))).rejects.toThrow('process.exit(2)');

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.eventType).toBe('tool_call');
    expect(event.payload.tool).toBe('Edit');
    expect(event.payload.phase).toBe('security');
    expect(event.payload.allowed).toBe(false);
  });

  it('blocks Write in security phase', async () => {
    setValidRunEnv('security');
    await expect(handlePreToolUse(makePayload('Write'))).rejects.toThrow('process.exit(2)');
  });

  it('blocks Bash in security phase', async () => {
    setValidRunEnv('security');
    await expect(handlePreToolUse(makePayload('Bash'))).rejects.toThrow('process.exit(2)');
  });

  it('blocks MultiEdit in security phase', async () => {
    setValidRunEnv('security');
    await expect(handlePreToolUse(makePayload('MultiEdit'))).rejects.toThrow('process.exit(2)');
  });
});

// ---------------------------------------------------------------------------
// 2. Develop phase — Edit is allowed
// ---------------------------------------------------------------------------

describe('handlePreToolUse — develop phase allows Edit', () => {
  it('resolves without calling process.exit when Edit is used in develop phase', async () => {
    setValidRunEnv('develop');

    await expect(handlePreToolUse(makePayload('Edit'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does not write anything to stdout when tool is allowed', async () => {
    setValidRunEnv('develop');

    await handlePreToolUse(makePayload('Edit'));

    const stdoutOutput = stdoutWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput).toBe('');
  });

  it('writes a tool_call trace event with allowed=true', async () => {
    setValidRunEnv('develop');

    await handlePreToolUse(makePayload('Bash'));

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.eventType).toBe('tool_call');
    expect(event.payload.allowed).toBe(true);
  });

  it('allows all tools in develop phase (allow: "*")', async () => {
    setValidRunEnv('develop');

    for (const tool of ['Edit', 'Write', 'Bash', 'MultiEdit', 'Read', 'Glob']) {
      vi.clearAllMocks();
      // Re-arm default stubs after clearAllMocks
      mockLoadToolsPolicy.mockResolvedValue(REAL_POLICY);
      mockIsToolAllowed.mockImplementation((t: string, p: string, policy: ToolsPolicy): boolean => {
        const pp = policy.phases[p];
        if (!pp) return true;
        const { allow, deny } = pp;
        if (deny && deny.includes(t)) return false;
        if (allow === undefined || allow === '*') return true;
        return (allow as string[]).includes(t);
      });
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
        throw new Error(`process.exit(${code})`);
      });
      stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await expect(handlePreToolUse(makePayload(tool))).resolves.toBeUndefined();

      processExitSpy.mockRestore();
      stdoutWriteSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Missing/invalid tools.yaml — fail-open (no block)
// ---------------------------------------------------------------------------

describe('handlePreToolUse — missing tools.yaml causes fail-open', () => {
  it('does NOT block when loadToolsPolicy throws (file not found)', async () => {
    mockLoadToolsPolicy.mockRejectedValue(new Error('ENOENT: no such file or directory'));
    setValidRunEnv('security');

    // Even though security normally blocks Edit, fail-open means no block
    await expect(handlePreToolUse(makePayload('Edit'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('writes a stderr warning when policy cannot be loaded', async () => {
    mockLoadToolsPolicy.mockRejectedValue(new Error('ENOENT'));
    setValidRunEnv('security');

    await handlePreToolUse(makePayload('Edit'));

    const stderrOutput = stderrWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('could not load tools policy');
    expect(stderrOutput).toContain('failing open');
  });

  it('does NOT block when loadToolsPolicy throws a YAML parse error', async () => {
    mockLoadToolsPolicy.mockRejectedValue(new SyntaxError('YAMLException: bad indentation'));
    setValidRunEnv('security');

    await expect(handlePreToolUse(makePayload('Edit'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does NOT block when loadToolsPolicy throws a schema validation error', async () => {
    mockLoadToolsPolicy.mockRejectedValue(new Error('ZodError: missing version field'));
    setValidRunEnv('security');

    await expect(handlePreToolUse(makePayload('Edit'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does not write to stdout (no block JSON) when policy load fails', async () => {
    mockLoadToolsPolicy.mockRejectedValue(new Error('ENOENT'));
    setValidRunEnv('security');

    await handlePreToolUse(makePayload('Edit'));

    const stdoutOutput = stdoutWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 4. Unknown phase — fail-open (no block)
// ---------------------------------------------------------------------------

describe('handlePreToolUse — unknown phase causes fail-open', () => {
  it('allows any tool when the phase is not defined in the policy', async () => {
    setValidRunEnv('nonexistent_phase');

    await expect(handlePreToolUse(makePayload('Edit'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does not write to stdout for an unknown phase', async () => {
    setValidRunEnv('some_future_phase');

    await handlePreToolUse(makePayload('Write'));

    const stdoutOutput = stdoutWriteSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stdoutOutput).toBe('');
  });

  it('records allowed=true in the trace event for an unknown phase', async () => {
    setValidRunEnv('phase_not_in_yaml');

    await handlePreToolUse(makePayload('Edit'));

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Missing FORJA_RUN_ID — early return (no trace, no block)
// ---------------------------------------------------------------------------

describe('handlePreToolUse — missing FORJA_RUN_ID skips processing', () => {
  it('returns early without writing trace when FORJA_RUN_ID is absent', async () => {
    delete process.env.FORJA_RUN_ID;
    process.env.FORJA_PHASE = 'security';

    await expect(handlePreToolUse(makePayload('Edit'))).resolves.toBeUndefined();

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns early without writing trace when FORJA_RUN_ID is not a UUID', async () => {
    process.env.FORJA_RUN_ID = 'not-a-uuid';
    process.env.FORJA_PHASE = 'security';

    await expect(handlePreToolUse(makePayload('Edit'))).resolves.toBeUndefined();

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Allowed tools within restricted phases pass through
// ---------------------------------------------------------------------------

describe('handlePreToolUse — allowed tools in restricted phases pass through', () => {
  it('allows Read in security phase (explicitly in allow list)', async () => {
    setValidRunEnv('security');

    await expect(handlePreToolUse(makePayload('Read'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('allows Grep in perf phase (explicitly in allow list)', async () => {
    setValidRunEnv('perf');

    await expect(handlePreToolUse(makePayload('Grep'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('blocks Bash in perf phase (in deny list)', async () => {
    setValidRunEnv('perf');

    await expect(handlePreToolUse(makePayload('Bash'))).rejects.toThrow('process.exit(2)');
  });

  it('blocks MultiEdit in review phase (in deny list)', async () => {
    setValidRunEnv('review');

    await expect(handlePreToolUse(makePayload('MultiEdit'))).rejects.toThrow('process.exit(2)');
  });

  it('allows all tools in test phase (allow: "*")', async () => {
    setValidRunEnv('test');

    await expect(handlePreToolUse(makePayload('Bash'))).resolves.toBeUndefined();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('blocks Write in audit_backend phase (in deny list, no allow list)', async () => {
    setValidRunEnv('audit_backend');

    await expect(handlePreToolUse(makePayload('Write'))).rejects.toThrow('process.exit(2)');
  });
});

// ---------------------------------------------------------------------------
// 7. Trace event shape — runId, phaseId, agentId are propagated correctly
// ---------------------------------------------------------------------------

describe('handlePreToolUse — trace event carries correct context IDs', () => {
  it('includes the runId from FORJA_RUN_ID in the trace event', async () => {
    const runId = setValidRunEnv('develop');

    await handlePreToolUse(makePayload('Read'));

    const [event] = mockWrite.mock.calls[0];
    expect(event.runId).toBe(runId);
  });

  it('includes phaseId from FORJA_PHASE_ID when it is a valid UUID', async () => {
    setValidRunEnv('develop');
    const phaseId = randomUUID();
    process.env.FORJA_PHASE_ID = phaseId;

    await handlePreToolUse(makePayload('Read'));

    const [event] = mockWrite.mock.calls[0];
    expect(event.phaseId).toBe(phaseId);
  });

  it('omits phaseId from trace event when FORJA_PHASE_ID is not a UUID', async () => {
    setValidRunEnv('develop');
    process.env.FORJA_PHASE_ID = 'not-a-uuid';

    await handlePreToolUse(makePayload('Read'));

    const [event] = mockWrite.mock.calls[0];
    expect(event.phaseId).toBeUndefined();
  });

  it('includes the tool name and phase in the payload', async () => {
    setValidRunEnv('develop');

    await handlePreToolUse(makePayload('Glob'));

    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.tool).toBe('Glob');
    expect(event.payload.phase).toBe('develop');
  });
});
