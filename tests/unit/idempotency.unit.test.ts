import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Checkpoint } from '../../src/engine/checkpoint.js';
import { PhaseIdempotencyGuard, cleanPhaseData } from '../../src/engine/idempotency.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUN_ID = '00000000-0000-0000-0000-000000000042';
const ISO_1 = '2024-06-01T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCheckpoint(phase: string): Checkpoint {
  return {
    runId: RUN_ID,
    phase: phase as Checkpoint['phase'],
    completedAt: ISO_1,
    artifactPaths: [],
    fsmState: phase as Checkpoint['fsmState'],
    phaseId: `id-${phase}`,
  };
}

function makeCheckpointManagerMock(completedPhases: string[] = []) {
  return {
    listCheckpoints: vi.fn().mockResolvedValue(completedPhases.map(makeCheckpoint)),
    deleteCheckpoint: vi.fn().mockResolvedValue(undefined),
    save: vi.fn(),
    getLastCompleted: vi.fn(),
    hasCompleted: vi.fn(),
  };
}

function makeStoreMock(): ForjaStore {
  return {
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
    deletePhaseData: vi.fn().mockResolvedValue(undefined),
    linkIssue: vi.fn(),
    listIssueLinks: vi.fn(),
    transitionRunStatus: vi.fn(),
    deleteRunsBefore: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
  } as unknown as ForjaStore;
}

// ---------------------------------------------------------------------------
// PhaseIdempotencyGuard.shouldRun()
// ---------------------------------------------------------------------------

describe('PhaseIdempotencyGuard.shouldRun()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when phase has NOT completed (listCheckpoints returns empty)', async () => {
    const checkpointManager = makeCheckpointManagerMock([]);
    const guard = new PhaseIdempotencyGuard(checkpointManager as any);

    const result = await guard.shouldRun('dev');

    expect(result).toBe(true);
  });

  it('returns false when phase already completed (listCheckpoints includes phase)', async () => {
    const checkpointManager = makeCheckpointManagerMock(['dev']);
    const guard = new PhaseIdempotencyGuard(checkpointManager as any);

    const result = await guard.shouldRun('dev');

    expect(result).toBe(false);
  });

  it('logs the skip message when phase already completed', async () => {
    const checkpointManager = makeCheckpointManagerMock(['dev']);
    const guard = new PhaseIdempotencyGuard(checkpointManager as any);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await guard.shouldRun('dev');

    expect(consoleSpy).toHaveBeenCalledWith(
      "[forja] Phase 'dev' already completed — skipping. Use --force to re-run.",
    );

    consoleSpy.mockRestore();
  });

  it('returns true when force: true even if phase already completed (does NOT call listCheckpoints)', async () => {
    const checkpointManager = makeCheckpointManagerMock(['dev']);
    const guard = new PhaseIdempotencyGuard(checkpointManager as any);

    const result = await guard.shouldRun('dev', { force: true });

    expect(result).toBe(true);
    expect(checkpointManager.listCheckpoints).not.toHaveBeenCalled();
  });

  it('returns true when force: false and phase not completed', async () => {
    const checkpointManager = makeCheckpointManagerMock([]);
    const guard = new PhaseIdempotencyGuard(checkpointManager as any);

    const result = await guard.shouldRun('dev', { force: false });

    expect(result).toBe(true);
    expect(checkpointManager.listCheckpoints).toHaveBeenCalledOnce();
  });

  it('calls listCheckpoints only once across multiple shouldRun calls (cache)', async () => {
    const checkpointManager = makeCheckpointManagerMock([]);
    const guard = new PhaseIdempotencyGuard(checkpointManager as any);

    await guard.shouldRun('dev');
    await guard.shouldRun('test');
    await guard.shouldRun('homolog');

    expect(checkpointManager.listCheckpoints).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// cleanPhaseData()
// ---------------------------------------------------------------------------

describe('cleanPhaseData()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls store.deletePhaseData with correct runId and phase', async () => {
    const store = makeStoreMock();
    const checkpointManager = makeCheckpointManagerMock();

    await cleanPhaseData(store, RUN_ID, 'dev', checkpointManager as any);

    expect(store.deletePhaseData).toHaveBeenCalledOnce();
    expect(store.deletePhaseData).toHaveBeenCalledWith(RUN_ID, 'dev');
  });

  it('calls checkpointManager.deleteCheckpoint with the correct phase', async () => {
    const store = makeStoreMock();
    const checkpointManager = makeCheckpointManagerMock();

    await cleanPhaseData(store, RUN_ID, 'dev', checkpointManager as any);

    expect(checkpointManager.deleteCheckpoint).toHaveBeenCalledOnce();
    expect(checkpointManager.deleteCheckpoint).toHaveBeenCalledWith('dev');
  });

  it('does not throw when deleteCheckpoint resolves normally', async () => {
    const store = makeStoreMock();
    const checkpointManager = makeCheckpointManagerMock();

    await expect(cleanPhaseData(store, RUN_ID, 'test', checkpointManager as any)).resolves.toBeUndefined();
  });

  it('re-throws if store.deletePhaseData rejects with an unexpected error', async () => {
    const store = makeStoreMock();
    const checkpointManager = makeCheckpointManagerMock();
    const unexpectedError = new Error('DB connection lost');
    vi.mocked(store.deletePhaseData).mockRejectedValueOnce(unexpectedError);

    await expect(cleanPhaseData(store, RUN_ID, 'dev', checkpointManager as any)).rejects.toThrow('DB connection lost');
  });
});
