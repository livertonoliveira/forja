/**
 * Integration tests for MOB-1011 — per-phase FORJA_MODEL setting in `forja run`.
 *
 * Tests cover:
 *   - FORJA_MODEL env var is set to the pinned model before each phase executes
 *   - FORJA_MODEL is set according to PHASE_POLICY_NAMES (e.g. 'dev' → 'develop')
 *   - --model <model> flag overrides the policy model for all phases
 *   - When models policy fails to load, FORJA_MODEL is NOT set (warn, continue)
 *   - run.model is recorded from the --model flag
 *   - PIPELINE_SEQUENCE contains expected phases in order
 *
 * Strategy:
 *   - Mock createStoreFromConfig (avoids real DB) using a minimal store stub.
 *   - Mock PipelineFSM, DualWriter, CheckpointManager so the run loop executes
 *     all phases without real infrastructure.
 *   - Mock loadModelsPolicy to inject controlled policy.
 *   - Spy on process.env to verify FORJA_MODEL is set per phase.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { ModelsPolicy } from '../../src/policy/models-policy.js';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Run, Phase } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module import
// ---------------------------------------------------------------------------

// Mock store factory — avoids real Postgres connection
const mockStore = {
  createRun: vi.fn(),
  updateRun: vi.fn(),
  getRun: vi.fn(),
  listRuns: vi.fn(),
  createPhase: vi.fn(),
  updatePhase: vi.fn(),
  getPhase: vi.fn(),
  listPhases: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  insertFinding: vi.fn(),
  insertFindings: vi.fn(),
  listFindings: vi.fn(),
  insertToolCall: vi.fn(),
  insertCostEvent: vi.fn(),
  costSummaryByPhase: vi.fn(),
  insertGateDecision: vi.fn(),
  getLatestGateDecision: vi.fn(),
  deletePhaseData: vi.fn(),
  linkIssue: vi.fn(),
  listIssueLinks: vi.fn(),
  transitionRunStatus: vi.fn(),
  deleteRunsBefore: vi.fn(),
  ping: vi.fn(),
  close: vi.fn(),
} satisfies ForjaStore;

vi.mock('../../src/store/factory.js', () => ({
  createStoreFromConfig: vi.fn().mockResolvedValue(mockStore),
}));

// Mock FSM — always succeeds transitions
vi.mock('../../src/engine/fsm.js', () => ({
  PipelineFSM: vi.fn().mockImplementation(() => ({
    transition: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn().mockResolvedValue('init'),
    canTransition: vi.fn().mockResolvedValue(true),
  })),
  InvalidTransitionError: class InvalidTransitionError extends Error {
    from: string;
    to: string;
    constructor(from: string, to: string) {
      super(`Cannot transition from '${from}' to '${to}'`);
      this.from = from;
      this.to = to;
    }
  },
  VALID_TRANSITIONS: {},
}));

// Mock DualWriter — records phase names written
const mockWritePhaseStart = vi.fn().mockResolvedValue(undefined);
const mockWritePhaseEnd = vi.fn().mockResolvedValue(undefined);
const mockWriteCheckpoint = vi.fn().mockResolvedValue(undefined);
const mockGetPhaseId = vi.fn().mockReturnValue(randomUUID());

vi.mock('../../src/trace/dual-writer.js', () => ({
  DualWriter: vi.fn().mockImplementation(() => ({
    writePhaseStart: mockWritePhaseStart,
    writePhaseEnd: mockWritePhaseEnd,
    writeCheckpoint: mockWriteCheckpoint,
    getPhaseId: mockGetPhaseId,
  })),
}));

// Mock TraceWriter
vi.mock('../../src/trace/writer.js', () => ({
  TraceWriter: vi.fn().mockImplementation(() => ({
    write: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock CheckpointManager — all phases are NOT completed (no skip)
vi.mock('../../src/engine/checkpoint.js', () => ({
  CheckpointManager: vi.fn().mockImplementation(() => ({
    list: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    hasCompleted: vi.fn().mockResolvedValue(false),
    listCheckpoints: vi.fn().mockResolvedValue([]),
    deleteCheckpoint: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock PhaseIdempotencyGuard — always says "yes, run this phase"
vi.mock('../../src/engine/idempotency.js', () => ({
  PhaseIdempotencyGuard: vi.fn().mockImplementation(() => ({
    shouldRun: vi.fn().mockResolvedValue(true),
  })),
  cleanPhaseData: vi.fn().mockResolvedValue(undefined),
}));

// Mock setPhaseTimeout (engine/timeout)
vi.mock('../../src/engine/timeout.js', () => ({
  setPhaseTimeout: vi.fn(),
}));

// Mock models policy loader
const mockLoadModelsPolicy = vi.fn<() => Promise<ModelsPolicy>>();
const mockGetModelForPhase = vi.fn<(phase: string, policy: ModelsPolicy) => string | undefined>();

vi.mock('../../src/policy/models-policy.js', () => ({
  loadModelsPolicy: (...args: unknown[]) => mockLoadModelsPolicy(...(args as [])),
  getModelForPhase: (...args: unknown[]) => mockGetModelForPhase(...(args as [string, ModelsPolicy])),
}));

// ---------------------------------------------------------------------------
// Lazy import after all mocks
// ---------------------------------------------------------------------------

const { runCommand, PIPELINE_SEQUENCE } = await import('../../src/cli/commands/run.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_ID = '00000000-0000-0000-0000-000000000011';
const ISO = '2024-01-01T00:00:00.000Z';

const STUB_MODELS_POLICY: ModelsPolicy = {
  version: '1',
  phases: {
    develop: 'claude-sonnet-4-6',
    test: 'claude-sonnet-4-6',
    homolog: 'claude-haiku-4-5',
    pr: 'claude-haiku-4-5',
  },
};

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: RUN_ID,
    issueId: 'MOB-1011',
    startedAt: ISO,
    finishedAt: null,
    status: 'init',
    gitBranch: null,
    gitSha: null,
    model: null,
    totalCost: '0',
    totalTokens: 0,
    ...overrides,
  };
}

function makePhase(name: string): Phase {
  return {
    id: randomUUID(),
    runId: RUN_ID,
    name,
    startedAt: ISO,
    finishedAt: null,
    status: 'running',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run `forja run <issueId>` via the Commander action handler directly,
 * capturing the FORJA_MODEL value set for each phase.
 *
 * Note: runCommand is already the 'run' sub-command, so parseAsync only
 * needs ['node', 'forja-run', <issue-id>, ...options]. Do NOT include 'run'
 * in args — Commander would treat it as the issue-id positional argument.
 *
 * IMPORTANT: Commander caches option values between parseAsync calls on the
 * same Command instance. We reset all known options to undefined before each
 * invocation to ensure tests are isolated.
 */
async function invokeRunCommand(args: string[]): Promise<void> {
  // Reset Commander option state between calls (Commander is stateful)
  runCommand.setOptionValue('model', undefined);
  runCommand.setOptionValue('dryRun', undefined);
  runCommand.setOptionValue('force', undefined);
  runCommand.setOptionValue('forcePhase', undefined);
  runCommand.setOptionValue('timeoutPhase', undefined);
  await runCommand.parseAsync(['node', 'forja-run', ...args]);
}

// ---------------------------------------------------------------------------
// Env management
// ---------------------------------------------------------------------------

const ENV_VARS = ['FORJA_MODEL'];

let originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();

  // Capture the initial values so we can restore
  for (const v of ENV_VARS) {
    originalEnv[v] = process.env[v];
    delete process.env[v];
  }

  // Default store stub responses
  mockStore.createRun.mockResolvedValue(makeRun());
  mockStore.createPhase.mockImplementation(async (data: { name: string }) => makePhase(data.name));
  mockStore.updatePhase.mockImplementation(async (id: string) => makePhase('dev'));
  mockStore.listPhases.mockResolvedValue([]);
  mockStore.transitionRunStatus.mockImplementation(async (_id: string, _from: string, to: string) =>
    makeRun({ status: to as Run['status'] }),
  );
  mockStore.close.mockResolvedValue(undefined);
  mockStore.getRun.mockResolvedValue(makeRun());

  // Default models policy
  mockLoadModelsPolicy.mockResolvedValue(STUB_MODELS_POLICY);
  mockGetModelForPhase.mockImplementation((phase: string, policy: ModelsPolicy) => policy.phases[phase]);
});

afterEach(() => {
  for (const v of ENV_VARS) {
    if (originalEnv[v] === undefined) {
      delete process.env[v];
    } else {
      process.env[v] = originalEnv[v];
    }
  }
  originalEnv = {};
});

// ---------------------------------------------------------------------------
// PIPELINE_SEQUENCE — structure
// ---------------------------------------------------------------------------

describe('PIPELINE_SEQUENCE — structure', () => {
  it('contains dev as the first phase', () => {
    expect(PIPELINE_SEQUENCE[0]).toBe('dev');
  });

  it('contains done as the last phase', () => {
    expect(PIPELINE_SEQUENCE[PIPELINE_SEQUENCE.length - 1]).toBe('done');
  });

  it('contains test after dev', () => {
    const devIdx = PIPELINE_SEQUENCE.indexOf('dev');
    const testIdx = PIPELINE_SEQUENCE.indexOf('test');
    expect(devIdx).toBeGreaterThanOrEqual(0);
    expect(testIdx).toBeGreaterThan(devIdx);
  });

  it('contains homolog before pr', () => {
    const homologIdx = PIPELINE_SEQUENCE.indexOf('homolog');
    const prIdx = PIPELINE_SEQUENCE.indexOf('pr');
    expect(homologIdx).toBeGreaterThanOrEqual(0);
    expect(prIdx).toBeGreaterThan(homologIdx);
  });

  it('has at least 4 phases (dev, test, homolog, pr)', () => {
    expect(PIPELINE_SEQUENCE.length).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// FORJA_MODEL per-phase setting — policy-driven
// ---------------------------------------------------------------------------

describe('forja run — FORJA_MODEL is set per-phase from models policy', () => {
  it('calls loadModelsPolicy once before the pipeline loop', async () => {
    await invokeRunCommand(['MOB-1011', '--dry-run']);
    expect(mockLoadModelsPolicy).toHaveBeenCalledOnce();
  });

  it('calls getModelForPhase for the dev phase (mapped to "develop")', async () => {
    await invokeRunCommand(['MOB-1011', '--dry-run']);
    // dev phase is mapped to 'develop' via PHASE_POLICY_NAMES
    expect(mockGetModelForPhase).toHaveBeenCalledWith('develop', STUB_MODELS_POLICY);
  });

  it('sets FORJA_MODEL to the develop policy model before dev phase (dry-run stops after dev)', async () => {
    const modelHistory: string[] = [];

    // Intercept FORJA_MODEL value when writePhaseStart is called (before phase runs)
    mockWritePhaseStart.mockImplementation(async () => {
      if (process.env.FORJA_MODEL) {
        modelHistory.push(process.env.FORJA_MODEL);
      }
    });

    await invokeRunCommand(['MOB-1011', '--dry-run']);

    // dry-run stops after the first phase (dev), which maps to 'develop' → claude-sonnet-4-6
    expect(modelHistory[0]).toBe('claude-sonnet-4-6');
  });

  it('sets FORJA_MODEL for each phase in the full pipeline (no --dry-run)', async () => {
    const modelByPhase: Record<string, string> = {};

    mockWritePhaseStart.mockImplementation(async (phase: string) => {
      if (process.env.FORJA_MODEL) {
        modelByPhase[phase] = process.env.FORJA_MODEL;
      }
    });

    await invokeRunCommand(['MOB-1011']);

    // dev maps to 'develop' in PHASE_POLICY_NAMES → claude-sonnet-4-6
    expect(modelByPhase['dev']).toBe('claude-sonnet-4-6');
    // test maps to 'test' (no rename) → claude-sonnet-4-6
    expect(modelByPhase['test']).toBe('claude-sonnet-4-6');
    // homolog maps to 'homolog' → claude-haiku-4-5
    expect(modelByPhase['homolog']).toBe('claude-haiku-4-5');
    // pr maps to 'pr' → claude-haiku-4-5
    expect(modelByPhase['pr']).toBe('claude-haiku-4-5');
  });
});

// ---------------------------------------------------------------------------
// --model flag overrides all phases
// ---------------------------------------------------------------------------

describe('forja run --model overrides all phases', () => {
  it('uses the --model value instead of the policy model for dev phase', async () => {
    const modelHistory: string[] = [];

    mockWritePhaseStart.mockImplementation(async () => {
      if (process.env.FORJA_MODEL) {
        modelHistory.push(process.env.FORJA_MODEL);
      }
    });

    await invokeRunCommand(['MOB-1011', '--model', 'claude-opus-4-7', '--dry-run']);

    expect(modelHistory[0]).toBe('claude-opus-4-7');
  });

  it('uses the --model value for ALL phases in the full pipeline', async () => {
    const modelByPhase: Record<string, string> = {};

    mockWritePhaseStart.mockImplementation(async (phase: string) => {
      if (process.env.FORJA_MODEL) {
        modelByPhase[phase] = process.env.FORJA_MODEL;
      }
    });

    await invokeRunCommand(['MOB-1011', '--model', 'claude-opus-4-7']);

    // All phases should use the overridden model regardless of policy
    for (const phase of Object.keys(modelByPhase)) {
      expect(modelByPhase[phase]).toBe('claude-opus-4-7');
    }
  });

  it('does not call getModelForPhase when --model is provided', async () => {
    await invokeRunCommand(['MOB-1011', '--model', 'claude-opus-4-7', '--dry-run']);
    // getModelForPhase should not be called when --model flag overrides
    expect(mockGetModelForPhase).not.toHaveBeenCalled();
  });

  it('still calls loadModelsPolicy even when --model is provided (policy loaded unconditionally)', async () => {
    await invokeRunCommand(['MOB-1011', '--model', 'claude-opus-4-7', '--dry-run']);
    // Policy is still loaded (for potential future use)
    expect(mockLoadModelsPolicy).toHaveBeenCalledOnce();
  });

  it('records the --model value in the run record via createRun', async () => {
    await invokeRunCommand(['MOB-1011', '--model', 'claude-opus-4-7', '--dry-run']);

    expect(mockStore.createRun).toHaveBeenCalledOnce();
    const createRunArg = mockStore.createRun.mock.calls[0][0];
    expect(createRunArg.model).toBe('claude-opus-4-7');
  });
});

// ---------------------------------------------------------------------------
// When models policy fails to load — warn and continue without FORJA_MODEL
// ---------------------------------------------------------------------------

describe('forja run — models policy load failure, pipeline continues without FORJA_MODEL', () => {
  it('does not throw when loadModelsPolicy rejects (ENOENT)', async () => {
    mockLoadModelsPolicy.mockRejectedValue(new Error('ENOENT: no such file'));

    await expect(invokeRunCommand(['MOB-1011', '--dry-run'])).resolves.toBeUndefined();
  });

  it('does not set FORJA_MODEL for any phase when models policy fails to load', async () => {
    mockLoadModelsPolicy.mockRejectedValue(new Error('ENOENT'));

    const modelHistory: (string | undefined)[] = [];
    mockWritePhaseStart.mockImplementation(async () => {
      modelHistory.push(process.env.FORJA_MODEL);
    });

    await invokeRunCommand(['MOB-1011', '--dry-run']);

    // FORJA_MODEL should not be set (undefined for every phase)
    for (const m of modelHistory) {
      expect(m).toBeUndefined();
    }
  });

  it('does not call getModelForPhase when models policy fails to load', async () => {
    mockLoadModelsPolicy.mockRejectedValue(new Error('ENOENT'));

    await invokeRunCommand(['MOB-1011', '--dry-run']);

    expect(mockGetModelForPhase).not.toHaveBeenCalled();
  });

  it('records model=null in the run record when no --model flag is given', async () => {
    await invokeRunCommand(['MOB-1011', '--dry-run']);

    const createRunArg = mockStore.createRun.mock.calls[0][0];
    expect(createRunArg.model).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase display name mapping (dev → develop)
// ---------------------------------------------------------------------------

describe('forja run — PHASE_POLICY_NAMES maps dev to develop', () => {
  it('passes "develop" (not "dev") to getModelForPhase when running the dev phase', async () => {
    await invokeRunCommand(['MOB-1011', '--dry-run']);

    const calls = mockGetModelForPhase.mock.calls;
    const phaseNamesUsed = calls.map((c) => c[0]);
    expect(phaseNamesUsed).toContain('develop');
    expect(phaseNamesUsed).not.toContain('dev');
  });

  it('uses the raw phase name (test) directly when no display name mapping exists', async () => {
    // Need full run (no dry-run) to reach test phase
    await invokeRunCommand(['MOB-1011']);

    const calls = mockGetModelForPhase.mock.calls;
    const phaseNamesUsed = calls.map((c) => c[0]);
    expect(phaseNamesUsed).toContain('test');
  });
});

// ---------------------------------------------------------------------------
// createRun with correct issue ID
// ---------------------------------------------------------------------------

describe('forja run — createRun records the issue ID', () => {
  it('calls createRun with the issue ID from the CLI argument', async () => {
    await invokeRunCommand(['MOB-1011', '--dry-run']);

    expect(mockStore.createRun).toHaveBeenCalledOnce();
    const arg = mockStore.createRun.mock.calls[0][0];
    expect(arg.issueId).toBe('MOB-1011');
  });

  it('calls createRun with status "init"', async () => {
    await invokeRunCommand(['MOB-1011', '--dry-run']);

    const arg = mockStore.createRun.mock.calls[0][0];
    expect(arg.status).toBe('init');
  });
});
