/**
 * Integration tests for MOB-1009 — phase idempotency features.
 *
 * Tests cover:
 *  1. PhaseIdempotencyGuard skips phases with existing checkpoints in a pipeline loop
 *  2. --force flag makes guard.shouldRun return true for ALL phases including completed ones
 *  3. --force-phase cleans up specific phase data and only re-runs that phase
 *  4. Guard calls listCheckpoints only once across the entire loop (cache)
 *  5. cleanPhaseData calls deletePhaseData exactly once with correct (runId, phase) tuple
 *  6. After cleanPhaseData, hasCompleted for that phase returns false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Phase } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// Mock fs/promises at the top (Vitest hoists vi.mock automatically)
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

import { CheckpointManager } from '../../src/engine/checkpoint.js';
import { PhaseIdempotencyGuard, cleanPhaseData } from '../../src/engine/idempotency.js';
import { PIPELINE_SEQUENCE } from '../../src/cli/commands/run.js';
import type { PipelineState } from '../../src/engine/fsm.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUN_ID = '00000000-0000-0000-0000-000000000099';
const ISO_1 = '2024-06-01T10:00:00.000Z';
const ISO_2 = '2024-06-01T11:00:00.000Z';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhase(overrides: Partial<Phase> = {}): Phase {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    runId: RUN_ID,
    name: 'dev',
    startedAt: ISO_1,
    finishedAt: null,
    status: 'running',
    ...overrides,
  };
}

function makeStoreMock(phases: Phase[] = []): ForjaStore {
  return {
    createRun: vi.fn(),
    updateRun: vi.fn(),
    getRun: vi.fn(),
    listRuns: vi.fn(),
    createPhase: vi.fn(),
    updatePhase: vi.fn().mockResolvedValue(makePhase()),
    getPhase: vi.fn(),
    listPhases: vi.fn().mockResolvedValue(phases),
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
// PhaseIdempotencyGuard — pipeline loop behavior
// ---------------------------------------------------------------------------

describe('PhaseIdempotencyGuard in pipeline loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips phases with existing checkpoints and runs only non-completed ones', async () => {
    // dev and test are completed; homolog, pr, done are not
    const store = makeStoreMock([
      makePhase({ id: 'id-dev', name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: 'id-test', name: 'test', status: 'completed', finishedAt: ISO_2 }),
    ]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);
    const guard = new PhaseIdempotencyGuard(checkpointManager);

    const ran: PipelineState[] = [];
    for (const phase of PIPELINE_SEQUENCE) {
      if (await guard.shouldRun(phase)) {
        ran.push(phase);
      }
    }

    expect(ran).not.toContain('dev');
    expect(ran).not.toContain('test');
    expect(ran).toContain('homolog');
    expect(ran).toContain('pr');
    expect(ran).toContain('done');
  });

  it('--force makes shouldRun return true for ALL phases including completed ones', async () => {
    const store = makeStoreMock([
      makePhase({ id: 'id-dev', name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: 'id-test', name: 'test', status: 'completed', finishedAt: ISO_2 }),
    ]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);
    const guard = new PhaseIdempotencyGuard(checkpointManager);

    const ran: PipelineState[] = [];
    for (const phase of PIPELINE_SEQUENCE) {
      if (await guard.shouldRun(phase, { force: true })) {
        ran.push(phase);
      }
    }

    for (const phase of PIPELINE_SEQUENCE) {
      expect(ran).toContain(phase);
    }
    expect(ran).toHaveLength(PIPELINE_SEQUENCE.length);
  });

  it('--force-phase dev only re-runs dev; other completed phases are still skipped', async () => {
    const store = makeStoreMock([
      makePhase({ id: 'id-dev', name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: 'id-test', name: 'test', status: 'completed', finishedAt: ISO_2 }),
    ]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);
    const guard = new PhaseIdempotencyGuard(checkpointManager);

    const forcePhase: PipelineState = 'dev';
    const ran: PipelineState[] = [];

    for (const phase of PIPELINE_SEQUENCE) {
      const forceThis = phase === forcePhase;
      if (await guard.shouldRun(phase, { force: forceThis })) {
        ran.push(phase);
      }
    }

    expect(ran).toContain('dev');
    expect(ran).not.toContain('test');
    expect(ran).toContain('homolog');
    expect(ran).toContain('pr');
    expect(ran).toContain('done');
  });

  it('listCheckpoints is called only once across the entire loop (cache)', async () => {
    const store = makeStoreMock([]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);
    const guard = new PhaseIdempotencyGuard(checkpointManager);

    for (const phase of PIPELINE_SEQUENCE) {
      await guard.shouldRun(phase);
    }

    // listPhases is called by listCheckpoints; should be called only once despite multiple shouldRun calls
    expect(store.listPhases).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// cleanPhaseData — integration with store
// ---------------------------------------------------------------------------

describe('cleanPhaseData integration with store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deletePhaseData exactly once with correct (runId, phase) tuple', async () => {
    const store = makeStoreMock([]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);
    const phase: PipelineState = 'dev';

    await cleanPhaseData(store, RUN_ID, phase, checkpointManager);

    expect(store.deletePhaseData).toHaveBeenCalledOnce();
    expect(store.deletePhaseData).toHaveBeenCalledWith(RUN_ID, phase);
  });

  it('calls deletePhaseData with the correct phase when cleaning test phase', async () => {
    const store = makeStoreMock([]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);
    const phase: PipelineState = 'test';

    await cleanPhaseData(store, RUN_ID, phase, checkpointManager);

    expect(store.deletePhaseData).toHaveBeenCalledOnce();
    expect(store.deletePhaseData).toHaveBeenCalledWith(RUN_ID, phase);
  });

  it('calls checkpointManager.deleteCheckpoint with the correct phase', async () => {
    const store = makeStoreMock([]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);
    const deleteSpy = vi.spyOn(checkpointManager, 'deleteCheckpoint');
    const phase: PipelineState = 'dev';

    await cleanPhaseData(store, RUN_ID, phase, checkpointManager);

    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledWith(phase);
  });

  it('does not throw when the checkpoint file does not exist', async () => {
    const store = makeStoreMock([]);
    const checkpointManager = new CheckpointManager(store, RUN_ID);

    // unlink is already mocked to resolve; just ensure no throw
    await expect(cleanPhaseData(store, RUN_ID, 'dev', checkpointManager)).resolves.toBeUndefined();
  });

  it('after cleanPhaseData, hasCompleted for that phase returns false (store reset)', async () => {
    const phases = [
      makePhase({ id: 'id-dev', name: 'dev', status: 'completed', finishedAt: ISO_1 }),
    ];
    const store = makeStoreMock(phases);
    const checkpointManager = new CheckpointManager(store, RUN_ID);

    expect(await checkpointManager.hasCompleted('dev')).toBe(true);

    // Simulate deletePhaseData effect: phase reset to running
    vi.mocked(store.listPhases).mockResolvedValue([
      makePhase({ id: 'id-dev', name: 'dev', status: 'running', finishedAt: null }),
    ]);

    await cleanPhaseData(store, RUN_ID, 'dev', checkpointManager);

    expect(await checkpointManager.hasCompleted('dev')).toBe(false);
  });

  it('after cleanPhaseData, only the cleaned phase is no longer completed (others unaffected)', async () => {
    const phases = [
      makePhase({ id: 'id-dev', name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: 'id-test', name: 'test', status: 'completed', finishedAt: ISO_2 }),
    ];
    const store = makeStoreMock(phases);
    const checkpointManager = new CheckpointManager(store, RUN_ID);

    expect(await checkpointManager.hasCompleted('dev')).toBe(true);
    expect(await checkpointManager.hasCompleted('test')).toBe(true);

    vi.mocked(store.listPhases).mockResolvedValue([
      makePhase({ id: 'id-dev', name: 'dev', status: 'running', finishedAt: null }),
      makePhase({ id: 'id-test', name: 'test', status: 'completed', finishedAt: ISO_2 }),
    ]);

    await cleanPhaseData(store, RUN_ID, 'dev', checkpointManager);

    expect(await checkpointManager.hasCompleted('dev')).toBe(false);
    expect(await checkpointManager.hasCompleted('test')).toBe(true);
  });
});
