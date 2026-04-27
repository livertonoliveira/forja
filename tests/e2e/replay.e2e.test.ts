/**
 * E2E tests for MOB-1013 — `forja replay` CLI command.
 *
 * This is a pure CLI tool (no web UI), so tests cover:
 *   1. CLI input validation — invalid UUID formats exit 1 immediately
 *   2. formatPhaseDiff / formatResult — output formatting (module-level, no DB)
 *   3. compareRuns — finding diff logic with a mocked store (no-regression / regression)
 *   4. replayRun (--compare mode) — end-to-end compare flow with a mocked store
 *
 * Note: the "re-execute" mode of replayRun (without --compare) spawns a real
 * `forja run` subprocess, which requires a live pipeline setup. That path is
 * intentionally NOT covered here — it belongs to integration tests that run
 * against a full environment.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import path from 'path';

import { formatPhaseDiff, formatResult } from '../../src/cli/commands/replay.js';
import { compareRuns, replayRun } from '../../src/engine/replay.js';
import type { PhaseDiff, ReplayResult } from '../../src/engine/replay.js';
import type { PipelineState } from '../../src/engine/fsm.js';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Run, Phase, Finding, GateDecision } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const TSX = path.resolve('node_modules/.bin/tsx');
const CLI_ENTRY = path.resolve('tests/e2e/_replay-runner.ts');
const PROJECT_ROOT = path.resolve('.');

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '00000000-0000-4000-8000-000000000002';
const ISO_NOW = '2025-01-15T10:00:00.000Z';

function makeId(): string {
  return randomUUID();
}

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: makeId(),
    issueId: 'MOB-1013',
    startedAt: ISO_NOW,
    finishedAt: null,
    status: 'done',
    gitBranch: null,
    gitSha: null,
    model: null,
    totalCost: '0',
    totalTokens: 0,
    ...overrides,
  };
}

function makePhase(runId: string, name: string, overrides: Partial<Phase> = {}): Phase {
  return {
    id: makeId(),
    runId,
    name,
    startedAt: ISO_NOW,
    finishedAt: ISO_NOW,
    status: 'completed',
    ...overrides,
  };
}

function makeFinding(runId: string, phaseId: string, overrides: Partial<Finding> = {}): Finding {
  return {
    id: makeId(),
    runId,
    phaseId,
    agentId: null,
    severity: 'low',
    category: 'test',
    filePath: null,
    line: null,
    title: 'Test finding',
    description: 'A test finding',
    suggestion: null,
    owasp: null,
    cwe: null,
    createdAt: ISO_NOW,
    ...overrides,
  };
}

function makeGateDecision(runId: string, phaseId: string, decision: GateDecision['decision']): GateDecision {
  return {
    id: makeId(),
    runId,
    phaseId,
    decision,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    policyApplied: 'default',
    decidedAt: ISO_NOW,
  };
}

/**
 * Build a minimal ForjaStore mock.
 * Only getRun, listPhases, listFindings, and getLatestGateDecision are exercised
 * by compareRuns / replayRun (compare mode).
 */
function makeStore(overrides: Partial<ForjaStore> = {}): ForjaStore {
  return {
    createRun: vi.fn(),
    updateRun: vi.fn(),
    getRun: vi.fn(async () => null),
    listRuns: vi.fn(async () => []),
    createPhase: vi.fn(),
    updatePhase: vi.fn(),
    getPhase: vi.fn(),
    listPhases: vi.fn(async () => []),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    insertFinding: vi.fn(),
    insertFindings: vi.fn(),
    listFindings: vi.fn(async () => []),
    insertToolCall: vi.fn(),
    insertCostEvent: vi.fn(),
    costSummaryByPhase: vi.fn(),
    insertGateDecision: vi.fn(),
    getLatestGateDecision: vi.fn(async () => null),
    deletePhaseData: vi.fn(),
    linkIssue: vi.fn(),
    listIssueLinks: vi.fn(),
    transitionRunStatus: vi.fn(),
    deleteRunsBefore: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(async () => {}),
    ...overrides,
  } as unknown as ForjaStore;
}

/**
 * Spawn `forja replay <args...>` via tsx as a subprocess.
 */
function runReplayCLI(...args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(TSX, [CLI_ENTRY, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Force no-DB mode so the command never tries to connect to Postgres.
      FORJA_STORE: 'noop',
    },
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1: CLI input validation — invalid UUID formats
// ---------------------------------------------------------------------------

describe('E2E (subprocess): forja replay — invalid UUID exits 1', () => {
  it('exits 1 when run-id is not a valid UUID', () => {
    const { exitCode, stderr } = runReplayCLI('not-a-uuid');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid run ID format');
  });

  it('exits 1 when --compare value is not a valid UUID', () => {
    const { exitCode, stderr } = runReplayCLI(VALID_UUID, '--compare', 'bad-id');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid --compare run ID format');
  });

  it('exits 1 when store is unreachable (real Postgres refused)', () => {
    const result = spawnSync(TSX, [CLI_ENTRY, VALID_UUID, '--compare', VALID_UUID_2], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        FORJA_STORE_URL: 'postgresql://forja:forja@127.0.0.1:1/forja_nonexistent',
      },
    });
    expect(result.status).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: formatPhaseDiff — output formatting (module-level)
// ---------------------------------------------------------------------------

describe('formatPhaseDiff: no changes', () => {
  it('returns "same" line when nothing changed', () => {
    const diff: PhaseDiff = {
      phase: 'perf' as PipelineState,
      findingsDiff: { added: [], removed: [], changed: [] },
      gateDecisionChanged: false,
      commandFingerprintChanged: false,
      originalGate: 'pass',
      originalCount: 3,
    };

    const output = formatPhaseDiff(diff);
    expect(output).toContain('PHASE PERF');
    expect(output).toContain('same');
    expect(output).toContain('3 findings');
    expect(output).toContain('same gate: PASS');
  });
});

describe('formatPhaseDiff: regression with added finding', () => {
  it('labels the phase as REGRESSION DETECTED and lists added finding', () => {
    const runId = makeId();
    const phaseId = makeId();
    const addedFinding = makeFinding(runId, phaseId, {
      severity: 'high',
      title: 'SQL Injection',
      filePath: 'src/db.ts',
      line: 42,
    });

    const diff: PhaseDiff = {
      phase: 'security' as PipelineState,
      findingsDiff: { added: [addedFinding], removed: [], changed: [] },
      gateDecisionChanged: true,
      commandFingerprintChanged: false,
      originalGate: 'pass',
      replayGate: 'fail',
    };

    const output = formatPhaseDiff(diff);
    expect(output).toContain('PHASE SECURITY');
    expect(output).toContain('REGRESSION DETECTED');
    expect(output).toContain('+ Added');
    expect(output).toContain('[high]');
    expect(output).toContain('SQL Injection');
    expect(output).toContain('src/db.ts:42');
    expect(output).toContain('PASS → FAIL');
  });
});

describe('formatPhaseDiff: regression with removed finding', () => {
  it('labels removed findings with a minus prefix', () => {
    const runId = makeId();
    const phaseId = makeId();
    const removedFinding = makeFinding(runId, phaseId, {
      severity: 'medium',
      title: 'N+1 query',
      filePath: null,
      line: null,
    });

    const diff: PhaseDiff = {
      phase: 'perf' as PipelineState,
      findingsDiff: { added: [], removed: [removedFinding], changed: [] },
      gateDecisionChanged: false,
      commandFingerprintChanged: false,
      originalGate: 'warn',
    };

    const output = formatPhaseDiff(diff);
    expect(output).toContain('REGRESSION DETECTED');
    expect(output).toContain('- Removed');
    expect(output).toContain('[medium]');
    expect(output).toContain('N+1 query');
    expect(output).toContain('unknown location');
  });
});

describe('formatPhaseDiff: command fingerprint changed', () => {
  it('mentions fingerprint change when commandFingerprintChanged is true', () => {
    const diff: PhaseDiff = {
      phase: 'dev' as PipelineState,
      findingsDiff: { added: [], removed: [], changed: [] },
      gateDecisionChanged: false,
      commandFingerprintChanged: true,
      originalGate: 'pass',
      originalCount: 0,
    };

    const output = formatPhaseDiff(diff);
    expect(output).toContain('REGRESSION DETECTED');
    expect(output).toContain('Command fingerprint changed');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: formatResult — overall result formatting
// ---------------------------------------------------------------------------

describe('formatResult: no regressions', () => {
  it('prints "no regressions detected" when regression is false', () => {
    const result: ReplayResult = {
      originalRunId: VALID_UUID,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: false,
    };

    const output = formatResult(result);
    expect(output).toContain(`Replay ${VALID_UUID_2} vs original ${VALID_UUID}`);
    expect(output).toContain('no regressions detected');
  });
});

describe('formatResult: regressions detected', () => {
  it('prints "REGRESSIONS DETECTED" when regression is true', () => {
    const result: ReplayResult = {
      originalRunId: VALID_UUID,
      replayRunId: VALID_UUID_2,
      diffs: [],
      regression: true,
    };

    const output = formatResult(result);
    expect(output).toContain('REGRESSIONS DETECTED');
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: compareRuns — no-regression when findings are identical
// ---------------------------------------------------------------------------

describe('compareRuns: no regression when findings are identical', () => {
  it('returns all diffs with no added/removed and regression=false', async () => {
    const runId1 = makeId();
    const runId2 = makeId();

    const phase1a = makePhase(runId1, 'perf');
    const phase2a = makePhase(runId2, 'perf');

    const sharedFinding = (runId: string, phaseId: string) =>
      makeFinding(runId, phaseId, { severity: 'low', category: 'perf', title: 'Slow loop' });

    const store = makeStore({
      listPhases: vi.fn(async (runId: string) =>
        runId === runId1 ? [phase1a] : [phase2a],
      ),
      listFindings: vi.fn(async ({ runId, phaseId }: { runId?: string; phaseId?: string }) => {
        if (runId === runId1 && phaseId === phase1a.id) return [sharedFinding(runId1, phase1a.id)];
        if (runId === runId2 && phaseId === phase2a.id) return [sharedFinding(runId2, phase2a.id)];
        return [];
      }),
      getLatestGateDecision: vi.fn(async (runId: string) =>
        makeGateDecision(runId, makeId(), 'pass'),
      ),
    });

    const diffs = await compareRuns(store, runId1, runId2);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].phase).toBe('perf');
    expect(diffs[0].findingsDiff.added).toHaveLength(0);
    expect(diffs[0].findingsDiff.removed).toHaveLength(0);
    expect(diffs[0].gateDecisionChanged).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: compareRuns — regression when a new high finding is added
// ---------------------------------------------------------------------------

describe('compareRuns: regression detected when new high finding is added', () => {
  it('adds finding shows up in diff.added and gate change is reported', async () => {
    const runId1 = makeId();
    const runId2 = makeId();

    const phase1 = makePhase(runId1, 'security');
    const phase2 = makePhase(runId2, 'security');

    const originalFinding = makeFinding(runId1, phase1.id, {
      severity: 'low',
      category: 'security',
      title: 'Missing header',
    });
    const newFinding = makeFinding(runId2, phase2.id, {
      severity: 'high',
      category: 'security',
      title: 'SQL Injection',
      filePath: 'src/db.ts',
      line: 10,
    });

    const store = makeStore({
      listPhases: vi.fn(async (runId: string) =>
        runId === runId1 ? [phase1] : [phase2],
      ),
      listFindings: vi.fn(async ({ runId, phaseId }: { runId?: string; phaseId?: string }) => {
        if (runId === runId1 && phaseId === phase1.id) return [originalFinding];
        if (runId === runId2 && phaseId === phase2.id) return [originalFinding, newFinding];
        return [];
      }),
      getLatestGateDecision: vi.fn(async (runId: string, phaseId?: string) => {
        const decision: GateDecision['decision'] = runId === runId1 ? 'pass' : 'fail';
        return makeGateDecision(runId, phaseId ?? makeId(), decision);
      }),
    });

    const diffs = await compareRuns(store, runId1, runId2);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].findingsDiff.added).toHaveLength(1);
    expect(diffs[0].findingsDiff.added[0].title).toBe('SQL Injection');
    expect(diffs[0].gateDecisionChanged).toBe(true);
    expect(diffs[0].originalGate).toBe('pass');
    expect(diffs[0].replayGate).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: compareRuns — phase filter limits comparison to requested phases
// ---------------------------------------------------------------------------

describe('compareRuns: phase filter limits comparison scope', () => {
  it('only compares requested phases, ignoring others present in the store', async () => {
    const runId1 = makeId();
    const runId2 = makeId();

    const perfPhase1 = makePhase(runId1, 'perf');
    const perfPhase2 = makePhase(runId2, 'perf');
    const secPhase1 = makePhase(runId1, 'security');
    const secPhase2 = makePhase(runId2, 'security');

    const listPhasesMock = vi.fn(async (runId: string) =>
      runId === runId1 ? [perfPhase1, secPhase1] : [perfPhase2, secPhase2],
    );

    const store = makeStore({
      listPhases: listPhasesMock,
      listFindings: vi.fn(async () => []),
      getLatestGateDecision: vi.fn(async () => null),
    });

    // Request only 'perf' phase
    const diffs = await compareRuns(store, runId1, runId2, ['perf' as PipelineState]);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].phase).toBe('perf');
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: replayRun (compare mode) — throws when run is not found
// ---------------------------------------------------------------------------

describe('replayRun (compare mode): throws when a run is not found', () => {
  it('throws "Run not found" when originalRunId does not exist in the store', async () => {
    const store = makeStore({
      getRun: vi.fn(async () => null),
    });

    await expect(
      replayRun(store, { runId: VALID_UUID, compareWith: VALID_UUID_2 }),
    ).rejects.toThrow(`Run not found: ${VALID_UUID}`);
  });

  it('throws "Run not found" when compareWith run does not exist', async () => {
    const originalRun = makeRun({ id: VALID_UUID });

    const store = makeStore({
      getRun: vi.fn(async (id: string) => (id === VALID_UUID ? originalRun : null)),
    });

    await expect(
      replayRun(store, { runId: VALID_UUID, compareWith: VALID_UUID_2 }),
    ).rejects.toThrow(`Run not found: ${VALID_UUID_2}`);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: replayRun (compare mode) — no regression when runs are identical
// ---------------------------------------------------------------------------

describe('replayRun (compare mode): no regression when runs are identical', () => {
  it('returns regression=false and matching run IDs when findings are the same', async () => {
    const runId1 = VALID_UUID;
    const runId2 = VALID_UUID_2;

    const originalRun = makeRun({ id: runId1 });
    const compareRun = makeRun({ id: runId2 });

    const phase1 = makePhase(runId1, 'perf');
    const phase2 = makePhase(runId2, 'perf');

    const sharedTitle = 'Redundant computation';

    const store = makeStore({
      getRun: vi.fn(async (id: string) => (id === runId1 ? originalRun : compareRun)),
      listPhases: vi.fn(async (runId: string) =>
        runId === runId1 ? [phase1] : [phase2],
      ),
      listFindings: vi.fn(async ({ runId, phaseId }: { runId?: string; phaseId?: string }) => [
        makeFinding(runId ?? runId1, phaseId ?? phase1.id, {
          severity: 'low',
          category: 'perf',
          title: sharedTitle,
        }),
      ]),
      getLatestGateDecision: vi.fn(async (runId: string, phaseId?: string) =>
        makeGateDecision(runId, phaseId ?? makeId(), 'pass'),
      ),
    });

    const result = await replayRun(store, { runId: runId1, compareWith: runId2 });

    expect(result.originalRunId).toBe(runId1);
    expect(result.replayRunId).toBe(runId2);
    expect(result.regression).toBe(false);
    expect(result.diffs).toHaveLength(1);
    expect(result.diffs[0].findingsDiff.added).toHaveLength(0);
    expect(result.diffs[0].findingsDiff.removed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: replayRun (compare mode) — regression when critical finding added
// ---------------------------------------------------------------------------

describe('replayRun (compare mode): regression=true when critical finding added', () => {
  it('reports regression when the replay run introduces a critical finding', async () => {
    const runId1 = VALID_UUID;
    const runId2 = VALID_UUID_2;

    const originalRun = makeRun({ id: runId1 });
    const compareRun = makeRun({ id: runId2 });

    const phase1 = makePhase(runId1, 'security');
    const phase2 = makePhase(runId2, 'security');

    const criticalFinding = makeFinding(runId2, phase2.id, {
      severity: 'critical',
      category: 'security',
      title: 'Remote Code Execution',
      filePath: 'src/exec.ts',
      line: 99,
    });

    const store = makeStore({
      getRun: vi.fn(async (id: string) => (id === runId1 ? originalRun : compareRun)),
      listPhases: vi.fn(async (runId: string) =>
        runId === runId1 ? [phase1] : [phase2],
      ),
      listFindings: vi.fn(async ({ runId }: { runId?: string; phaseId?: string }) => {
        if (runId === runId2) return [criticalFinding];
        return [];
      }),
      getLatestGateDecision: vi.fn(async (runId: string, phaseId?: string) => {
        const decision: GateDecision['decision'] = runId === runId1 ? 'pass' : 'fail';
        return makeGateDecision(runId, phaseId ?? makeId(), decision);
      }),
    });

    const result = await replayRun(store, { runId: runId1, compareWith: runId2 });

    expect(result.regression).toBe(true);
    expect(result.diffs[0].findingsDiff.added).toHaveLength(1);
    expect(result.diffs[0].findingsDiff.added[0].severity).toBe('critical');
    expect(result.diffs[0].findingsDiff.added[0].title).toBe('Remote Code Execution');
  });
});
