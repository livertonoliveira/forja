import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Phase } from '../../src/store/types.js';
import { CheckpointManager, type Checkpoint } from '../../src/engine/checkpoint.js';

// ---------------------------------------------------------------------------
// Mock fs/promises
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue('{}'),
  },
}));

import fs from 'fs/promises';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUN_ID = '00000000-0000-0000-0000-000000000042';
const PHASE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ISO_1 = '2024-06-01T10:00:00.000Z';
const ISO_2 = '2024-06-01T11:00:00.000Z';

const CHECKPOINT_DIR = path.join('forja', 'state', 'runs', RUN_ID, 'checkpoints');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhase(overrides: Partial<Phase> = {}): Phase {
  return {
    id: PHASE_ID,
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
    linkIssue: vi.fn(),
    listIssueLinks: vi.fn(),
    transitionRunStatus: vi.fn(),
    deleteRunsBefore: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
  } as unknown as ForjaStore;
}

// ---------------------------------------------------------------------------
// save()
// ---------------------------------------------------------------------------

describe('CheckpointManager.save()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls store.updatePhase with status "completed" and a finishedAt ISO string', async () => {
    const store = makeStoreMock();
    const mgr = new CheckpointManager(store, RUN_ID);

    await mgr.save('dev', PHASE_ID);

    expect(store.updatePhase).toHaveBeenCalledOnce();
    expect(store.updatePhase).toHaveBeenCalledWith(PHASE_ID, {
      status: 'completed',
      finishedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    });
  });

  it('creates the checkpoint directory with recursive flag', async () => {
    const store = makeStoreMock();
    const mgr = new CheckpointManager(store, RUN_ID);

    await mgr.save('dev', PHASE_ID);

    expect(fs.mkdir).toHaveBeenCalledWith(CHECKPOINT_DIR, { recursive: true });
  });

  it('writes a JSON file at the correct path', async () => {
    const store = makeStoreMock();
    const mgr = new CheckpointManager(store, RUN_ID);

    await mgr.save('dev', PHASE_ID);

    const expectedPath = path.join(CHECKPOINT_DIR, 'dev.json');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expectedPath,
      expect.any(String),
      'utf8',
    );
  });

  it('writes a valid Checkpoint JSON with all required fields', async () => {
    const store = makeStoreMock();
    const mgr = new CheckpointManager(store, RUN_ID);

    await mgr.save('test', PHASE_ID);

    const [, rawJson] = vi.mocked(fs.writeFile).mock.calls[0] as [string, string, string];
    const checkpoint = JSON.parse(rawJson) as Checkpoint;

    expect(checkpoint.runId).toBe(RUN_ID);
    expect(checkpoint.phase).toBe('test');
    expect(checkpoint.fsmState).toBe('test');
    expect(checkpoint.phaseId).toBe(PHASE_ID);
    expect(checkpoint.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Array.isArray(checkpoint.artifactPaths)).toBe(true);
    expect(checkpoint.artifactPaths.length).toBeGreaterThan(0);
  });

  it('includes trace.jsonl, findings.json, and cost.json in artifactPaths', async () => {
    const store = makeStoreMock();
    const mgr = new CheckpointManager(store, RUN_ID);

    await mgr.save('security', PHASE_ID);

    const [, rawJson] = vi.mocked(fs.writeFile).mock.calls[0] as [string, string, string];
    const checkpoint = JSON.parse(rawJson) as Checkpoint;

    const runBase = path.join('forja', 'state', 'runs', RUN_ID);
    expect(checkpoint.artifactPaths).toContain(path.join(runBase, 'trace.jsonl'));
    expect(checkpoint.artifactPaths).toContain(path.join(runBase, 'findings.json'));
    expect(checkpoint.artifactPaths).toContain(path.join(runBase, 'cost.json'));
  });
});

// ---------------------------------------------------------------------------
// getLastCompleted() — store has completed phases
// ---------------------------------------------------------------------------

describe('CheckpointManager.getLastCompleted() — from store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when store returns no phases', async () => {
    const store = makeStoreMock([]);
    const mgr = new CheckpointManager(store, RUN_ID);

    // Also mock readdir to return empty (no fallback files)
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    const result = await mgr.getLastCompleted();

    expect(result).toBeNull();
  });

  it('returns null when store has phases but none are completed', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'running', finishedAt: null }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    const result = await mgr.getLastCompleted();

    expect(result).toBeNull();
  });

  it('returns the completed phase as a Checkpoint', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.getLastCompleted();

    expect(result).not.toBeNull();
    expect(result!.runId).toBe(RUN_ID);
    expect(result!.phase).toBe('dev');
    expect(result!.fsmState).toBe('dev');
    expect(result!.phaseId).toBe(PHASE_ID);
    expect(result!.completedAt).toBe(ISO_1);
  });

  it('returns the most recently completed phase when multiple exist', async () => {
    const phaseId2 = 'bbbbbbbb-0000-0000-0000-000000000002';
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: phaseId2, name: 'test', status: 'completed', finishedAt: ISO_2 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.getLastCompleted();

    expect(result!.phase).toBe('test');
    expect(result!.completedAt).toBe(ISO_2);
    expect(result!.phaseId).toBe(phaseId2);
  });

  it('ignores phases with finishedAt null even if status is completed', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: null }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    const result = await mgr.getLastCompleted();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getLastCompleted() — file fallback
// ---------------------------------------------------------------------------

describe('CheckpointManager.getLastCompleted() — file fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads from checkpoint files when store returns empty list', async () => {
    const store = makeStoreMock([]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const checkpoint: Checkpoint = {
      runId: RUN_ID,
      phase: 'dev',
      completedAt: ISO_1,
      artifactPaths: [],
      fsmState: 'dev',
      phaseId: PHASE_ID,
    };

    // New approach: reverse-walk PIPELINE_SEQUENCE; readFile succeeds only for dev.json
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith('dev.json')) return JSON.stringify(checkpoint) as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await mgr.getLastCompleted();

    expect(result).not.toBeNull();
    expect(result!.phase).toBe('dev');
    expect(result!.runId).toBe(RUN_ID);
  });

  it('returns the latest phase in sequence when multiple checkpoint files exist', async () => {
    const store = makeStoreMock([]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const checkpointDev: Checkpoint = {
      runId: RUN_ID,
      phase: 'dev',
      completedAt: ISO_1,
      artifactPaths: [],
      fsmState: 'dev',
      phaseId: PHASE_ID,
    };

    const checkpointTest: Checkpoint = {
      runId: RUN_ID,
      phase: 'test',
      completedAt: ISO_2,
      artifactPaths: [],
      fsmState: 'test',
      phaseId: 'cccccccc-0000-0000-0000-000000000003',
    };

    // Reverse-walk stops at test.json (latest in sequence)
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      if (String(filePath).endsWith('test.json')) return JSON.stringify(checkpointTest) as any;
      if (String(filePath).endsWith('dev.json')) return JSON.stringify(checkpointDev) as any;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await mgr.getLastCompleted();

    expect(result!.phase).toBe('test');
    expect(result!.completedAt).toBe(ISO_2);
  });

  it('returns null when all readFile attempts fail (no checkpoint files)', async () => {
    const store = makeStoreMock([]);
    const mgr = new CheckpointManager(store, RUN_ID);

    vi.mocked(fs.readFile).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await mgr.getLastCompleted();

    expect(result).toBeNull();
  });

  it('returns null when checkpoint files contain invalid JSON', async () => {
    const store = makeStoreMock([]);
    const mgr = new CheckpointManager(store, RUN_ID);

    vi.mocked(fs.readFile).mockResolvedValue('not-valid-json' as any);

    const result = await mgr.getLastCompleted();

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// hasCompleted()
// ---------------------------------------------------------------------------

describe('CheckpointManager.hasCompleted()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when the phase has a completed checkpoint', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.hasCompleted('dev');

    expect(result).toBe(true);
  });

  it('returns false when the phase does not have a completed checkpoint', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'running', finishedAt: null }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.hasCompleted('dev');

    expect(result).toBe(false);
  });

  it('returns false when no phases exist', async () => {
    const store = makeStoreMock([]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.hasCompleted('test');

    expect(result).toBe(false);
  });

  it('returns false for a phase that is not the completed one', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.hasCompleted('test');

    expect(result).toBe(false);
  });

  it('returns true even when other non-completed phases exist alongside the completed one', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: 'bbbbbbbb-0000-0000-0000-000000000002', name: 'test', status: 'running', finishedAt: null }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    expect(await mgr.hasCompleted('dev')).toBe(true);
    expect(await mgr.hasCompleted('test')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listCheckpoints()
// ---------------------------------------------------------------------------

describe('CheckpointManager.listCheckpoints()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no phases exist', async () => {
    const store = makeStoreMock([]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.listCheckpoints();

    expect(result).toEqual([]);
  });

  it('returns empty array when no phases are completed', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'running', finishedAt: null }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.listCheckpoints();

    expect(result).toEqual([]);
  });

  it('returns a Checkpoint[] for each completed phase', async () => {
    const phaseId2 = 'bbbbbbbb-0000-0000-0000-000000000002';
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: phaseId2, name: 'test', status: 'completed', finishedAt: ISO_2 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.listCheckpoints();

    expect(result).toHaveLength(2);
  });

  it('does not include non-completed phases', async () => {
    const phaseId2 = 'bbbbbbbb-0000-0000-0000-000000000002';
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
      makePhase({ id: phaseId2, name: 'test', status: 'running', finishedAt: null }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const result = await mgr.listCheckpoints();

    expect(result).toHaveLength(1);
    expect(result[0].phase).toBe('dev');
  });

  it('each returned Checkpoint has the correct shape', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const [checkpoint] = await mgr.listCheckpoints();

    expect(checkpoint.runId).toBe(RUN_ID);
    expect(checkpoint.phase).toBe('dev');
    expect(checkpoint.fsmState).toBe('dev');
    expect(checkpoint.phaseId).toBe(PHASE_ID);
    expect(checkpoint.completedAt).toBe(ISO_1);
    expect(Array.isArray(checkpoint.artifactPaths)).toBe(true);
  });

  it('sets completedAt to startedAt when finishedAt is null for completed phases', async () => {
    // listCheckpoints uses p.finishedAt ?? p.startedAt
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: null, startedAt: ISO_1 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const [checkpoint] = await mgr.listCheckpoints();

    expect(checkpoint.completedAt).toBe(ISO_1);
  });

  it('includes artifact paths for trace, findings, and cost', async () => {
    const store = makeStoreMock([
      makePhase({ id: PHASE_ID, name: 'dev', status: 'completed', finishedAt: ISO_1 }),
    ]);
    const mgr = new CheckpointManager(store, RUN_ID);

    const [checkpoint] = await mgr.listCheckpoints();

    const runBase = path.join('forja', 'state', 'runs', RUN_ID);
    expect(checkpoint.artifactPaths).toContain(path.join(runBase, 'trace.jsonl'));
    expect(checkpoint.artifactPaths).toContain(path.join(runBase, 'findings.json'));
    expect(checkpoint.artifactPaths).toContain(path.join(runBase, 'cost.json'));
  });
});
