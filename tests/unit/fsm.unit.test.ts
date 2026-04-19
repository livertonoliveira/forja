import { describe, it, expect, vi } from 'vitest';
import { PipelineFSM, InvalidTransitionError, VALID_TRANSITIONS, type PipelineState } from '../../src/engine/fsm.js';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Run } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_ID = '00000000-0000-0000-0000-000000000001';
const ISO = '2024-01-01T00:00:00.000Z';

function makeRun(status: Run['status']): Run {
  return {
    id: RUN_ID,
    issueId: 'MOB-1007',
    startedAt: ISO,
    finishedAt: null,
    status,
    gitBranch: null,
    gitSha: null,
    model: null,
    totalCost: '0',
    totalTokens: 0,
  };
}

function makeStore(initialStatus: Run['status']): ForjaStore {
  let currentStatus = initialStatus;
  return {
    getRun: vi.fn(async () => makeRun(currentStatus)),
    transitionRunStatus: vi.fn(async (_id, expectedFrom, to) => {
      if (currentStatus !== expectedFrom) {
        throw new Error(`concurrent transition: expected '${expectedFrom}' but found '${currentStatus}' for run ${_id}`);
      }
      currentStatus = to;
      return makeRun(currentStatus);
    }),
    // Unused stubs
    createRun: vi.fn(),
    updateRun: vi.fn(),
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
    linkIssue: vi.fn(),
    listIssueLinks: vi.fn(),
    deleteRunsBefore: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
  } as unknown as ForjaStore;
}

// ---------------------------------------------------------------------------
// VALID_TRANSITIONS — table completeness
// ---------------------------------------------------------------------------

describe('VALID_TRANSITIONS', () => {
  const allStates: PipelineState[] = [
    'init', 'spec', 'dev', 'test', 'perf', 'security', 'review', 'homolog', 'pr', 'done', 'failed',
  ];

  it('has an entry for every PipelineState', () => {
    for (const state of allStates) {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
    }
  });

  it('done has no valid transitions (terminal state)', () => {
    expect(VALID_TRANSITIONS['done']).toHaveLength(0);
  });

  it('failed can only retry via dev', () => {
    expect(VALID_TRANSITIONS['failed']).toEqual(['dev']);
  });
});

// ---------------------------------------------------------------------------
// PipelineFSM.getState()
// ---------------------------------------------------------------------------

describe('PipelineFSM.getState()', () => {
  it('returns the current status from the store', async () => {
    const store = makeStore('dev');
    const fsm = new PipelineFSM(store, RUN_ID);
    expect(await fsm.getState()).toBe('dev');
  });

  it('throws when run is not found', async () => {
    const store = makeStore('init');
    (store.getRun as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const fsm = new PipelineFSM(store, RUN_ID);
    await expect(fsm.getState()).rejects.toThrow(`Run not found: ${RUN_ID}`);
  });

  it('always reads from the store (no in-memory cache)', async () => {
    const store = makeStore('init');
    const fsm = new PipelineFSM(store, RUN_ID);
    await fsm.getState();
    await fsm.getState();
    expect(store.getRun).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// PipelineFSM.canTransition()
// ---------------------------------------------------------------------------

describe('PipelineFSM.canTransition()', () => {
  it('returns true for a valid transition', async () => {
    const store = makeStore('init');
    const fsm = new PipelineFSM(store, RUN_ID);
    expect(await fsm.canTransition('dev')).toBe(true);
  });

  it('returns false for an invalid transition', async () => {
    const store = makeStore('done');
    const fsm = new PipelineFSM(store, RUN_ID);
    expect(await fsm.canTransition('dev')).toBe(false);
  });

  it('returns false when transitioning to self', async () => {
    const store = makeStore('dev');
    const fsm = new PipelineFSM(store, RUN_ID);
    expect(await fsm.canTransition('dev')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PipelineFSM.transition() — valid transitions
// ---------------------------------------------------------------------------

describe('PipelineFSM.transition() — valid', () => {
  it('transitions init → dev successfully', async () => {
    const store = makeStore('init');
    const fsm = new PipelineFSM(store, RUN_ID);
    await expect(fsm.transition('dev')).resolves.toBeUndefined();
    expect(store.transitionRunStatus).toHaveBeenCalledWith(RUN_ID, 'init', 'dev');
  });

  it('transitions dev → test successfully', async () => {
    const store = makeStore('dev');
    const fsm = new PipelineFSM(store, RUN_ID);
    await expect(fsm.transition('test')).resolves.toBeUndefined();
  });

  it('transitions failed → dev (retry path)', async () => {
    const store = makeStore('failed');
    const fsm = new PipelineFSM(store, RUN_ID);
    await expect(fsm.transition('dev')).resolves.toBeUndefined();
  });

  it('transitions test → homolog (skipping quality phases)', async () => {
    const store = makeStore('test');
    const fsm = new PipelineFSM(store, RUN_ID);
    await expect(fsm.transition('homolog')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PipelineFSM.transition() — invalid transitions
// ---------------------------------------------------------------------------

describe('PipelineFSM.transition() — invalid', () => {
  it('throws InvalidTransitionError for done → dev', async () => {
    const store = makeStore('done');
    const fsm = new PipelineFSM(store, RUN_ID);
    await expect(fsm.transition('dev')).rejects.toThrow(InvalidTransitionError);
  });

  it('throws InvalidTransitionError for init → done', async () => {
    const store = makeStore('init');
    const fsm = new PipelineFSM(store, RUN_ID);
    await expect(fsm.transition('done')).rejects.toThrow(InvalidTransitionError);
  });

  it('error message includes both from and to states', async () => {
    const store = makeStore('pr');
    const fsm = new PipelineFSM(store, RUN_ID);
    const err = await fsm.transition('init').catch((e) => e);
    expect(err).toBeInstanceOf(InvalidTransitionError);
    expect(err.message).toContain('pr');
    expect(err.message).toContain('init');
    expect(err.from).toBe('pr');
    expect(err.to).toBe('init');
  });

  it('does not call transitionRunStatus for invalid transitions', async () => {
    const store = makeStore('done');
    const fsm = new PipelineFSM(store, RUN_ID);
    await fsm.transition('dev').catch(() => {});
    expect(store.transitionRunStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PipelineFSM.transition() — concurrent transitions (row-level lock)
// ---------------------------------------------------------------------------

describe('PipelineFSM.transition() — concurrent transitions', () => {
  it('only one concurrent transition wins; the other throws InvalidTransitionError', async () => {
    let lockAcquired = false;

    // Simulate a store where the second caller finds a changed state
    const store = makeStore('init');
    const originalTransition = (store.transitionRunStatus as ReturnType<typeof vi.fn>).getMockImplementation()!;
    let callCount = 0;
    (store.transitionRunStatus as ReturnType<typeof vi.fn>).mockImplementation(async (id, expectedFrom, to) => {
      callCount++;
      if (callCount === 1) {
        // First caller: succeeds normally
        lockAcquired = true;
        return originalTransition(id, expectedFrom, to);
      } else {
        // Second caller: simulate the state has already changed
        throw new Error(`concurrent transition: expected '${expectedFrom}' but found 'dev' for run ${id}`);
      }
    });

    const fsm1 = new PipelineFSM(store, RUN_ID);
    const fsm2 = new PipelineFSM(store, RUN_ID);

    const [result1, result2] = await Promise.allSettled([
      fsm1.transition('dev'),
      fsm2.transition('dev'),
    ]);

    expect(lockAcquired).toBe(true);
    const statuses = [result1.status, result2.status];
    expect(statuses).toContain('fulfilled');
    expect(statuses).toContain('rejected');

    const rejected = [result1, result2].find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InvalidTransitionError);
  });
});
