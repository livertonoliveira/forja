import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Run, Phase, Finding, GateDecision } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// Mock drift-detector before importing replay
// ---------------------------------------------------------------------------

vi.mock('../../src/engine/drift-detector.js', () => ({
  detectCommandDrift: vi.fn().mockResolvedValue({
    runId1: 'run-1',
    runId2: 'run-2',
    drifted: [],
    unchanged: [],
    onlyInRun1: [],
    onlyInRun2: [],
  }),
}));

// Mock child_process spawn for full-replay tests
vi.mock('child_process', () => {
  const EventEmitter = require('events');
  const spawnMock = vi.fn(() => {
    const child = new EventEmitter();
    // Emit close with code 0 (success) on next tick
    process.nextTick(() => child.emit('close', 0));
    return child;
  });
  const execFileMock = vi.fn((_cmd: string, _args: string[], cb: Function) => {
    cb(null, '', '');
  });
  return { spawn: spawnMock, execFile: execFileMock };
});

import { compareRuns, replayRun } from '../../src/engine/replay.js';
import { detectCommandDrift } from '../../src/engine/drift-detector.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUN_ID_1 = '00000000-0000-0000-0000-000000000001';
const RUN_ID_2 = '00000000-0000-0000-0000-000000000002';
const ISO = '2024-01-01T00:00:00.000Z';
const ISO_AFTER = '2024-01-01T01:00:00.000Z';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(id: string, overrides: Partial<Run> = {}): Run {
  return {
    id,
    issueId: 'MOB-1013',
    startedAt: ISO,
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

function makePhase(id: string, name: string, runId: string): Phase {
  return {
    id,
    runId,
    name,
    startedAt: ISO,
    finishedAt: ISO,
    status: 'done',
  };
}

function makeFinding(
  id: string,
  runId: string,
  phaseId: string,
  severity: Finding['severity'],
  category: string,
  title: string,
): Finding {
  return {
    id,
    runId,
    phaseId,
    agentId: null,
    severity,
    category,
    filePath: null,
    line: null,
    title,
    description: 'A description',
    suggestion: null,
    owasp: null,
    cwe: null,
    createdAt: ISO,
  };
}

function makeGate(
  id: string,
  runId: string,
  phaseId: string,
  decision: GateDecision['decision'],
): GateDecision {
  return {
    id,
    runId,
    phaseId,
    decision,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    policyApplied: 'default',
    decidedAt: ISO,
  };
}

function makeStore(overrides: Partial<ForjaStore> = {}): ForjaStore {
  return {
    createRun: vi.fn(),
    updateRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    createPhase: vi.fn(),
    updatePhase: vi.fn(),
    getPhase: vi.fn(),
    listPhases: vi.fn().mockResolvedValue([]),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    insertFinding: vi.fn(),
    insertFindings: vi.fn(),
    listFindings: vi.fn().mockResolvedValue([]),
    insertToolCall: vi.fn(),
    insertCostEvent: vi.fn(),
    costSummaryByPhase: vi.fn(),
    insertGateDecision: vi.fn(),
    getLatestGateDecision: vi.fn().mockResolvedValue(null),
    deletePhaseData: vi.fn(),
    linkIssue: vi.fn(),
    listIssueLinks: vi.fn(),
    transitionRunStatus: vi.fn(),
    deleteRunsBefore: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as ForjaStore;
}

// ---------------------------------------------------------------------------
// compareRuns
// ---------------------------------------------------------------------------

describe('compareRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset drift mock to default (no drift)
    (detectCommandDrift as ReturnType<typeof vi.fn>).mockResolvedValue({
      runId1: RUN_ID_1,
      runId2: RUN_ID_2,
      drifted: [],
      unchanged: [],
      onlyInRun1: [],
      onlyInRun2: [],
    });
  });

  describe('happy path — identical findings', () => {
    it('returns empty diffs when both runs have identical findings', async () => {
      const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
      const finding = makeFinding('f-1', RUN_ID_1, 'ph-1', 'high', 'injection', 'SQL Injection');
      const finding2 = makeFinding('f-2', RUN_ID_2, 'ph-2', 'high', 'injection', 'SQL Injection');

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn()
          .mockResolvedValueOnce([finding])
          .mockResolvedValueOnce([finding2]),
        getLatestGateDecision: vi.fn().mockResolvedValue(null),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].findingsDiff.added).toHaveLength(0);
      expect(diffs[0].findingsDiff.removed).toHaveLength(0);
      expect(diffs[0].gateDecisionChanged).toBe(false);
    });
  });

  describe('added findings', () => {
    it('places in added when finding exists in run2 but not run1', async () => {
      const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
      const newFinding = makeFinding('f-2', RUN_ID_2, 'ph-2', 'high', 'xss', 'XSS Found');

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn()
          .mockResolvedValueOnce([]) // run1: no findings
          .mockResolvedValueOnce([newFinding]), // run2: one new finding
        getLatestGateDecision: vi.fn().mockResolvedValue(null),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs[0].findingsDiff.added).toHaveLength(1);
      expect(diffs[0].findingsDiff.added[0].title).toBe('XSS Found');
      expect(diffs[0].findingsDiff.removed).toHaveLength(0);
    });
  });

  describe('removed findings', () => {
    it('places in removed when finding exists in run1 but not run2', async () => {
      const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
      const oldFinding = makeFinding('f-1', RUN_ID_1, 'ph-1', 'medium', 'csrf', 'CSRF Vulnerability');

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn()
          .mockResolvedValueOnce([oldFinding]) // run1: one finding
          .mockResolvedValueOnce([]), // run2: no findings (fixed)
        getLatestGateDecision: vi.fn().mockResolvedValue(null),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs[0].findingsDiff.removed).toHaveLength(1);
      expect(diffs[0].findingsDiff.removed[0].title).toBe('CSRF Vulnerability');
      expect(diffs[0].findingsDiff.added).toHaveLength(0);
    });
  });

  describe('same finding by key', () => {
    it('does not appear in added or removed when severity:category:title matches', async () => {
      const phase1 = makePhase('ph-1', 'test', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'test', RUN_ID_2);
      const f1 = makeFinding('f-1', RUN_ID_1, 'ph-1', 'low', 'lint', 'Unused variable');
      const f2 = makeFinding('f-2', RUN_ID_2, 'ph-2', 'low', 'lint', 'Unused variable');

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn()
          .mockResolvedValueOnce([f1])
          .mockResolvedValueOnce([f2]),
        getLatestGateDecision: vi.fn().mockResolvedValue(null),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs[0].findingsDiff.added).toHaveLength(0);
      expect(diffs[0].findingsDiff.removed).toHaveLength(0);
    });
  });

  describe('gate decision changed', () => {
    it('sets gateDecisionChanged=true when gate1=pass and gate2=fail', async () => {
      const phase1 = makePhase('ph-1', 'perf', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'perf', RUN_ID_2);
      const gate1 = makeGate('g-1', RUN_ID_1, 'ph-1', 'pass');
      const gate2 = makeGate('g-2', RUN_ID_2, 'ph-2', 'fail');

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn().mockResolvedValue([]),
        getLatestGateDecision: vi.fn()
          .mockResolvedValueOnce(gate1)
          .mockResolvedValueOnce(gate2),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs[0].gateDecisionChanged).toBe(true);
    });

    it('sets gateDecisionChanged=false when gate1=pass and gate2=pass', async () => {
      const phase1 = makePhase('ph-1', 'perf', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'perf', RUN_ID_2);
      const gate1 = makeGate('g-1', RUN_ID_1, 'ph-1', 'pass');
      const gate2 = makeGate('g-2', RUN_ID_2, 'ph-2', 'pass');

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn().mockResolvedValue([]),
        getLatestGateDecision: vi.fn()
          .mockResolvedValueOnce(gate1)
          .mockResolvedValueOnce(gate2),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs[0].gateDecisionChanged).toBe(false);
    });

    it('sets gateDecisionChanged=false when both gates are null', async () => {
      const phase1 = makePhase('ph-1', 'perf', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'perf', RUN_ID_2);

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn().mockResolvedValue([]),
        getLatestGateDecision: vi.fn().mockResolvedValue(null),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs[0].gateDecisionChanged).toBe(false);
    });
  });

  describe('phase filtering', () => {
    it('only returns specified phases when phases param is provided', async () => {
      const secPhase1 = makePhase('ph-s1', 'security', RUN_ID_1);
      const perfPhase1 = makePhase('ph-p1', 'perf', RUN_ID_1);
      const secPhase2 = makePhase('ph-s2', 'security', RUN_ID_2);
      const perfPhase2 = makePhase('ph-p2', 'perf', RUN_ID_2);

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([secPhase1, perfPhase1])
          .mockResolvedValueOnce([secPhase2, perfPhase2]),
        listFindings: vi.fn().mockResolvedValue([]),
        getLatestGateDecision: vi.fn().mockResolvedValue(null),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2, ['security']);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].phase).toBe('security');
    });

    it('returns all phases when phases param is not provided', async () => {
      const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'perf', RUN_ID_1);
      const phase3 = makePhase('ph-3', 'security', RUN_ID_2);
      const phase4 = makePhase('ph-4', 'perf', RUN_ID_2);

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1, phase2])
          .mockResolvedValueOnce([phase3, phase4]),
        listFindings: vi.fn().mockResolvedValue([]),
        getLatestGateDecision: vi.fn().mockResolvedValue(null),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs).toHaveLength(2);
      const phases = diffs.map(d => d.phase);
      expect(phases).toContain('security');
      expect(phases).toContain('perf');
    });
  });

  describe('optional fields', () => {
    it('populates originalGate, replayGate, originalCount and replayCount', async () => {
      const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
      const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
      const gate1 = makeGate('g-1', RUN_ID_1, 'ph-1', 'pass');
      const gate2 = makeGate('g-2', RUN_ID_2, 'ph-2', 'warn');
      const f1 = makeFinding('f-1', RUN_ID_1, 'ph-1', 'low', 'a', 'A');
      const f2 = makeFinding('f-2', RUN_ID_2, 'ph-2', 'medium', 'b', 'B');
      const f3 = makeFinding('f-3', RUN_ID_2, 'ph-2', 'low', 'c', 'C');

      const store = makeStore({
        listPhases: vi.fn()
          .mockResolvedValueOnce([phase1])
          .mockResolvedValueOnce([phase2]),
        listFindings: vi.fn()
          .mockResolvedValueOnce([f1])
          .mockResolvedValueOnce([f2, f3]),
        getLatestGateDecision: vi.fn()
          .mockResolvedValueOnce(gate1)
          .mockResolvedValueOnce(gate2),
      });

      const diffs = await compareRuns(store, RUN_ID_1, RUN_ID_2);

      expect(diffs[0].originalGate).toBe('pass');
      expect(diffs[0].replayGate).toBe('warn');
      expect(diffs[0].originalCount).toBe(1);
      expect(diffs[0].replayCount).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// replayRun — compareWith mode
// ---------------------------------------------------------------------------

describe('replayRun — compareWith mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (detectCommandDrift as ReturnType<typeof vi.fn>).mockResolvedValue({
      runId1: RUN_ID_1,
      runId2: RUN_ID_2,
      drifted: [],
      unchanged: [],
      onlyInRun1: [],
      onlyInRun2: [],
    });
  });

  it('throws when originalRun is not found', async () => {
    const store = makeStore({
      getRun: vi.fn().mockResolvedValue(null),
    });

    await expect(
      replayRun(store, { runId: RUN_ID_1, compareWith: RUN_ID_2 }),
    ).rejects.toThrow(`Run not found: ${RUN_ID_1}`);
  });

  it('throws when compareRun is not found', async () => {
    const store = makeStore({
      getRun: vi.fn()
        .mockResolvedValueOnce(makeRun(RUN_ID_1))
        .mockResolvedValueOnce(null),
    });

    await expect(
      replayRun(store, { runId: RUN_ID_1, compareWith: RUN_ID_2 }),
    ).rejects.toThrow(`Run not found: ${RUN_ID_2}`);
  });

  it('returns correct result with both runs found and no regression', async () => {
    const store = makeStore({
      getRun: vi.fn()
        .mockResolvedValueOnce(makeRun(RUN_ID_1))
        .mockResolvedValueOnce(makeRun(RUN_ID_2)),
      listPhases: vi.fn().mockResolvedValue([]),
    });

    const result = await replayRun(store, { runId: RUN_ID_1, compareWith: RUN_ID_2 });

    expect(result.originalRunId).toBe(RUN_ID_1);
    expect(result.replayRunId).toBe(RUN_ID_2);
    expect(result.regression).toBe(false);
  });

  it('sets regression=true when gateDecisionChanged', async () => {
    const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
    const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
    const gate1 = makeGate('g-1', RUN_ID_1, 'ph-1', 'pass');
    const gate2 = makeGate('g-2', RUN_ID_2, 'ph-2', 'fail');

    const store = makeStore({
      getRun: vi.fn()
        .mockResolvedValueOnce(makeRun(RUN_ID_1))
        .mockResolvedValueOnce(makeRun(RUN_ID_2)),
      listPhases: vi.fn()
        .mockResolvedValueOnce([phase1])
        .mockResolvedValueOnce([phase2]),
      listFindings: vi.fn().mockResolvedValue([]),
      getLatestGateDecision: vi.fn()
        .mockResolvedValueOnce(gate1)
        .mockResolvedValueOnce(gate2),
    });

    const result = await replayRun(store, { runId: RUN_ID_1, compareWith: RUN_ID_2 });

    expect(result.regression).toBe(true);
  });

  it('sets regression=true when a critical finding is added', async () => {
    const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
    const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
    const criticalFinding = makeFinding('f-crit', RUN_ID_2, 'ph-2', 'critical', 'rce', 'RCE');

    const store = makeStore({
      getRun: vi.fn()
        .mockResolvedValueOnce(makeRun(RUN_ID_1))
        .mockResolvedValueOnce(makeRun(RUN_ID_2)),
      listPhases: vi.fn()
        .mockResolvedValueOnce([phase1])
        .mockResolvedValueOnce([phase2]),
      listFindings: vi.fn()
        .mockResolvedValueOnce([]) // run1: no findings
        .mockResolvedValueOnce([criticalFinding]), // run2: critical added
      getLatestGateDecision: vi.fn().mockResolvedValue(null),
    });

    const result = await replayRun(store, { runId: RUN_ID_1, compareWith: RUN_ID_2 });

    expect(result.regression).toBe(true);
  });

  it('sets regression=true when a high finding is added', async () => {
    const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
    const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
    const highFinding = makeFinding('f-high', RUN_ID_2, 'ph-2', 'high', 'sqli', 'SQL Injection');

    const store = makeStore({
      getRun: vi.fn()
        .mockResolvedValueOnce(makeRun(RUN_ID_1))
        .mockResolvedValueOnce(makeRun(RUN_ID_2)),
      listPhases: vi.fn()
        .mockResolvedValueOnce([phase1])
        .mockResolvedValueOnce([phase2]),
      listFindings: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([highFinding]),
      getLatestGateDecision: vi.fn().mockResolvedValue(null),
    });

    const result = await replayRun(store, { runId: RUN_ID_1, compareWith: RUN_ID_2 });

    expect(result.regression).toBe(true);
  });

  it('sets regression=false when only low/medium findings are added', async () => {
    const phase1 = makePhase('ph-1', 'security', RUN_ID_1);
    const phase2 = makePhase('ph-2', 'security', RUN_ID_2);
    const mediumFinding = makeFinding('f-med', RUN_ID_2, 'ph-2', 'medium', 'info', 'Info Leak');
    const lowFinding = makeFinding('f-low', RUN_ID_2, 'ph-2', 'low', 'log', 'Verbose Logging');

    const store = makeStore({
      getRun: vi.fn()
        .mockResolvedValueOnce(makeRun(RUN_ID_1))
        .mockResolvedValueOnce(makeRun(RUN_ID_2)),
      listPhases: vi.fn()
        .mockResolvedValueOnce([phase1])
        .mockResolvedValueOnce([phase2]),
      listFindings: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mediumFinding, lowFinding]),
      getLatestGateDecision: vi.fn().mockResolvedValue(null),
    });

    const result = await replayRun(store, { runId: RUN_ID_1, compareWith: RUN_ID_2 });

    expect(result.regression).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// replayRun — full replay mode (no compareWith)
// ---------------------------------------------------------------------------

describe('replayRun — full replay mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (detectCommandDrift as ReturnType<typeof vi.fn>).mockResolvedValue({
      runId1: RUN_ID_1,
      runId2: RUN_ID_2,
      drifted: [],
      unchanged: [],
      onlyInRun1: [],
      onlyInRun2: [],
    });
  });

  it('throws when run is not found', async () => {
    const store = makeStore({
      getRun: vi.fn().mockResolvedValue(null),
    });

    await expect(replayRun(store, { runId: RUN_ID_1 })).rejects.toThrow(
      `Run not found: ${RUN_ID_1}`,
    );
  });

  it('warns but does not throw when gitSha is not available', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const newRunId = '00000000-0000-0000-0000-000000000099';
    // startedAt must be >= Date.now() so the replay code can find the new run
    const futureIso = new Date(Date.now() + 5000).toISOString();
    const newRun = makeRun(newRunId, { issueId: 'MOB-1013', startedAt: futureIso });

    const store = makeStore({
      getRun: vi.fn().mockResolvedValue(makeRun(RUN_ID_1, { gitSha: 'abc123abc123abc123abc123abc123abc123abc1' })),
      listRuns: vi.fn().mockResolvedValue([newRun]),
      listPhases: vi.fn().mockResolvedValue([]),
    });

    // execFile is mocked to call cb with error to simulate unavailable SHA
    const { execFile } = await import('child_process');
    (execFile as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_cmd: string, _args: string[], cb: Function) => {
        cb(new Error('unknown object'), '', '');
      },
    );

    const result = await replayRun(store, { runId: RUN_ID_1 });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unavailable'));
    expect(result.originalRunId).toBe(RUN_ID_1);
    warnSpy.mockRestore();
  });

  it('returns regression=false when new run has no additional high/critical findings', async () => {
    const newRunId = '00000000-0000-0000-0000-000000000099';
    // startedAt must be >= Date.now() so the replay code can find the new run
    const futureIso = new Date(Date.now() + 5000).toISOString();
    const newRun = makeRun(newRunId, { issueId: 'MOB-1013', startedAt: futureIso });

    const store = makeStore({
      getRun: vi.fn().mockResolvedValue(makeRun(RUN_ID_1)),
      listRuns: vi.fn().mockResolvedValue([newRun]),
      listPhases: vi.fn().mockResolvedValue([]),
    });

    const result = await replayRun(store, { runId: RUN_ID_1 });

    expect(result.regression).toBe(false);
    expect(result.replayRunId).toBe(newRunId);
  });
});
