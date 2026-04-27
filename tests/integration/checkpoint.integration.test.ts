/**
 * Integration tests for MOB-1008 — phase checkpoint flow.
 *
 * Tests cover:
 *  1. CheckpointManager.save() writes a JSON file to the correct path
 *  2. CheckpointManager.getLastCompleted() correctly identifies the last
 *     completed phase from Postgres phase rows (mocked via ForjaStore)
 *  3. CheckpointManager.hasCompleted(phase) returns correct results
 *  4. The resume command correctly reads a checkpoint and identifies the
 *     next phase to run (logic replicated from resume.ts)
 *  5. Resume exits with error if no checkpoint exists for the run
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Phase, Run } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// vi.mock must be at the top level (Vitest hoists it automatically).
// We use vi.hoisted() to define mock functions so they are available inside
// the vi.mock factory (which is also hoisted to the top of the file).
// ---------------------------------------------------------------------------

const { mkdirMock, writeFileMock, readFileMock, readdirMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn(async () => undefined),
  writeFileMock: vi.fn(async () => undefined),
  readFileMock: vi.fn(async () => '{}'),
  readdirMock: vi.fn(async () => [] as string[]),
}));

vi.mock('fs/promises', () => {
  const fsObject = {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
    readFile: readFileMock,
    readdir: readdirMock,
  };
  return {
    default: fsObject,
    ...fsObject,
  };
});

// Import AFTER the mock declaration (Vitest hoists vi.mock, so this is fine)
import { CheckpointManager } from '../../src/engine/checkpoint.js';
import { PIPELINE_SEQUENCE } from '../../src/cli/commands/run.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUN_ID = '00000000-0000-4000-8000-000000000002';
const ISO_BASE = '2024-06-01T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Helpers — fake Phase rows
// ---------------------------------------------------------------------------

function makePhase(overrides: Partial<Phase> & Pick<Phase, 'id' | 'name'>): Phase {
  return {
    runId: RUN_ID,
    startedAt: ISO_BASE,
    finishedAt: null,
    status: 'pending',
    ...overrides,
  };
}

function makeRun(status: Run['status'] = 'dev'): Run {
  return {
    id: RUN_ID,
    issueId: 'MOB-1008',
    startedAt: ISO_BASE,
    finishedAt: null,
    status,
    gitBranch: null,
    gitSha: null,
    model: null,
    totalCost: '0',
    totalTokens: 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers — mock ForjaStore
// ---------------------------------------------------------------------------

function makeStore(phases: Phase[], run: Run | null = makeRun()): ForjaStore {
  return {
    getRun: vi.fn(async () => run),
    transitionRunStatus: vi.fn(),
    createRun: vi.fn(),
    updateRun: vi.fn(),
    listRuns: vi.fn(),
    createPhase: vi.fn(),
    updatePhase: vi.fn(async () => phases[0] ?? null),
    getPhase: vi.fn(),
    listPhases: vi.fn(async () => phases),
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
// Reset fs mocks between tests to avoid bleed-over
// ---------------------------------------------------------------------------

beforeEach(() => {
  mkdirMock.mockReset();
  writeFileMock.mockReset();
  readFileMock.mockReset();
  readdirMock.mockReset();

  // Default implementations
  mkdirMock.mockResolvedValue(undefined);
  writeFileMock.mockResolvedValue(undefined);
  readFileMock.mockResolvedValue('{}');
  readdirMock.mockResolvedValue([] as unknown as string[]);
});

afterEach(() => {
  // No-op — mocks are reset in beforeEach
});

// ---------------------------------------------------------------------------
// 1. CheckpointManager.save() — file written to correct path
// ---------------------------------------------------------------------------

describe('CheckpointManager.save()', () => {
  it('writes a JSON checkpoint file to forja/state/runs/<runId>/checkpoints/<phase>.json', async () => {
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    await manager.save('dev', 'phase-001');

    expect(mkdirMock).toHaveBeenCalledWith(
      path.join('forja', 'state', 'runs', RUN_ID, 'checkpoints'),
      { recursive: true },
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join('forja', 'state', 'runs', RUN_ID, 'checkpoints', 'dev.json'),
      expect.any(String),
      'utf8',
    );
  });

  it('writes valid JSON containing runId, phase, fsmState, and phaseId', async () => {
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    await manager.save('test', 'phase-002');

    const writtenJson = writeFileMock.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenJson);
    expect(parsed.runId).toBe(RUN_ID);
    expect(parsed.phase).toBe('test');
    expect(parsed.fsmState).toBe('test');
    expect(parsed.phaseId).toBe('phase-002');
  });

  it('calls updatePhase on the store with status=completed', async () => {
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    await manager.save('dev', 'phase-001');

    expect(store.updatePhase).toHaveBeenCalledWith('phase-001', {
      status: 'completed',
      finishedAt: expect.any(String),
    });
  });

  it('checkpoint JSON includes an ISO completedAt timestamp', async () => {
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    const before = new Date().toISOString();
    await manager.save('homolog', 'phase-003');
    const after = new Date().toISOString();

    const writtenJson = writeFileMock.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenJson);
    expect(parsed.completedAt >= before).toBe(true);
    expect(parsed.completedAt <= after).toBe(true);
  });

  it('checkpoint JSON includes expected artifactPaths', async () => {
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    await manager.save('dev', 'phase-001');

    const writtenJson = writeFileMock.mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenJson);
    const runBase = path.join('forja', 'state', 'runs', RUN_ID);
    expect(parsed.artifactPaths).toContain(path.join(runBase, 'trace.jsonl'));
    expect(parsed.artifactPaths).toContain(path.join(runBase, 'findings.json'));
    expect(parsed.artifactPaths).toContain(path.join(runBase, 'cost.json'));
  });
});

// ---------------------------------------------------------------------------
// 2. CheckpointManager.getLastCompleted() — from Postgres phase rows
// ---------------------------------------------------------------------------

describe('CheckpointManager.getLastCompleted()', () => {
  it('returns null when listPhases returns an empty array and no local files exist', async () => {
    // readdirMock returns [] by default — no local checkpoint files
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result).toBeNull();
  });

  it('returns null when no phase has status=completed and no local files exist', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'running', finishedAt: null }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result).toBeNull();
  });

  it('returns the single completed phase', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'completed', finishedAt: '2024-06-01T10:01:00.000Z' }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result).not.toBeNull();
    expect(result!.phase).toBe('dev');
    expect(result!.phaseId).toBe('p1');
    expect(result!.runId).toBe(RUN_ID);
  });

  it('returns the most recently completed phase when multiple phases are completed', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'completed', finishedAt: '2024-06-01T10:01:00.000Z' }),
      makePhase({ id: 'p2', name: 'test', status: 'completed', finishedAt: '2024-06-01T10:02:00.000Z' }),
      makePhase({ id: 'p3', name: 'homolog', status: 'completed', finishedAt: '2024-06-01T10:03:00.000Z' }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result!.phase).toBe('homolog');
    expect(result!.phaseId).toBe('p3');
  });

  it('ignores completed phases that have finishedAt=null', async () => {
    // A phase with status=completed but no finishedAt should be excluded
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'completed', finishedAt: '2024-06-01T10:01:00.000Z' }),
      makePhase({ id: 'p2', name: 'test', status: 'completed', finishedAt: null }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result!.phase).toBe('dev');
    expect(result!.phaseId).toBe('p1');
  });

  it('returns checkpoint with correct fsmState matching the phase name', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'test', status: 'completed', finishedAt: '2024-06-01T10:02:00.000Z' }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result!.fsmState).toBe('test');
  });

  it('returns checkpoint including standard artifactPaths', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'completed', finishedAt: '2024-06-01T10:01:00.000Z' }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    const runBase = path.join('forja', 'state', 'runs', RUN_ID);
    expect(result!.artifactPaths).toContain(path.join(runBase, 'trace.jsonl'));
  });
});

// ---------------------------------------------------------------------------
// 3. CheckpointManager.hasCompleted(phase)
// ---------------------------------------------------------------------------

describe('CheckpointManager.hasCompleted()', () => {
  it('returns false when no phases are completed', async () => {
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    expect(await manager.hasCompleted('dev')).toBe(false);
  });

  it('returns true when the specified phase is completed', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'completed', finishedAt: '2024-06-01T10:01:00.000Z' }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    expect(await manager.hasCompleted('dev')).toBe(true);
  });

  it('returns false when a different phase is completed but not the requested one', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'completed', finishedAt: '2024-06-01T10:01:00.000Z' }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    expect(await manager.hasCompleted('test')).toBe(false);
  });

  it('returns false for a phase that is running but not completed', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'running', finishedAt: null }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    expect(await manager.hasCompleted('dev')).toBe(false);
  });

  it('returns true for each individually completed phase', async () => {
    const phases: Phase[] = [
      makePhase({ id: 'p1', name: 'dev', status: 'completed', finishedAt: '2024-06-01T10:01:00.000Z' }),
      makePhase({ id: 'p2', name: 'test', status: 'completed', finishedAt: '2024-06-01T10:02:00.000Z' }),
    ];
    const store = makeStore(phases);
    const manager = new CheckpointManager(store, RUN_ID);

    expect(await manager.hasCompleted('dev')).toBe(true);
    expect(await manager.hasCompleted('test')).toBe(true);
    expect(await manager.hasCompleted('homolog')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. resume logic — next phase identification
// ---------------------------------------------------------------------------
// We test the resume logic directly (without spawning a subprocess) by
// replicating the PIPELINE_SEQUENCE slice logic from resume.ts.

describe('resume — next phase identification', () => {
  it('PIPELINE_SEQUENCE is exported from run.ts', () => {
    expect(Array.isArray(PIPELINE_SEQUENCE)).toBe(true);
    expect(PIPELINE_SEQUENCE.length).toBeGreaterThan(0);
  });

  it('identifies the next phase after dev as test', () => {
    const completedPhase = 'dev';
    const lastIndex = PIPELINE_SEQUENCE.indexOf(completedPhase);
    const remainingPhases = lastIndex >= 0 ? PIPELINE_SEQUENCE.slice(lastIndex + 1) : PIPELINE_SEQUENCE;

    expect(remainingPhases[0]).toBe('test');
  });

  it('identifies the next phase after test as homolog', () => {
    const completedPhase = 'test';
    const lastIndex = PIPELINE_SEQUENCE.indexOf(completedPhase);
    const remainingPhases = PIPELINE_SEQUENCE.slice(lastIndex + 1);

    expect(remainingPhases[0]).toBe('homolog');
  });

  it('returns empty remainingPhases when the last phase (done) has completed', () => {
    const completedPhase = 'done';
    const lastIndex = PIPELINE_SEQUENCE.indexOf(completedPhase);
    const remainingPhases = lastIndex >= 0 ? PIPELINE_SEQUENCE.slice(lastIndex + 1) : PIPELINE_SEQUENCE;

    expect(remainingPhases).toHaveLength(0);
  });

  it('returns all phases as remaining when checkpoint.fsmState is not in PIPELINE_SEQUENCE', () => {
    const completedPhase = 'spec'; // spec is not in PIPELINE_SEQUENCE
    const lastIndex = PIPELINE_SEQUENCE.indexOf(completedPhase);
    const remainingPhases = lastIndex >= 0 ? PIPELINE_SEQUENCE.slice(lastIndex + 1) : PIPELINE_SEQUENCE;

    expect(remainingPhases).toEqual(PIPELINE_SEQUENCE);
  });

  it('correctly slices phases already completed', () => {
    const completedPhase = 'homolog';
    const lastIndex = PIPELINE_SEQUENCE.indexOf(completedPhase);
    const alreadyCompleted = PIPELINE_SEQUENCE.slice(0, lastIndex + 1);

    expect(alreadyCompleted).toContain('dev');
    expect(alreadyCompleted).toContain('test');
    expect(alreadyCompleted).toContain('homolog');
    expect(alreadyCompleted).not.toContain('pr');
  });
});

// ---------------------------------------------------------------------------
// 5. resume — no checkpoint scenario (getLastCompleted returns null)
// ---------------------------------------------------------------------------

describe('resume — no checkpoint exists', () => {
  it('getLastCompleted returns null when store has no completed phases and no checkpoint files', async () => {
    // readdirMock returns [] by default — no local checkpoint files
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    const checkpoint = await manager.getLastCompleted();

    expect(checkpoint).toBeNull();
  });

  it('getLastCompleted returns null even when readdir throws (no checkpoint directory)', async () => {
    readdirMock.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    const checkpoint = await manager.getLastCompleted();

    expect(checkpoint).toBeNull();
  });

  it('resume logic: missing checkpoint means no phases can be skipped', async () => {
    // When checkpoint is null, the resume command logs an error and exits.
    // We verify the branching logic: null checkpoint → cannot identify next phase.
    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    const checkpoint = await manager.getLastCompleted();

    // In resume.ts: if (!checkpoint) → process.exit(1)
    expect(checkpoint).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Fallback: getLastCompleted reads local checkpoint files when store is empty
// ---------------------------------------------------------------------------

describe('CheckpointManager.getLastCompleted() — local file fallback', () => {
  it('reads checkpoint from local files when store listPhases returns no completed phases', async () => {
    const checkpointData = {
      runId: RUN_ID,
      phase: 'dev',
      completedAt: '2024-06-01T10:01:00.000Z',
      artifactPaths: [],
      fsmState: 'dev',
      phaseId: 'phase-001',
    };

    // New reverse-walk approach: readFile resolves for dev.json, rejects for all others
    readFileMock.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).endsWith('dev.json')) return JSON.stringify(checkpointData);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const store = makeStore([]); // no completed phases in store
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result).not.toBeNull();
    expect(result!.phase).toBe('dev');
    expect(result!.phaseId).toBe('phase-001');
  });

  it('returns the latest phase in sequence when multiple checkpoint files exist', async () => {
    const dev = {
      runId: RUN_ID,
      phase: 'dev',
      completedAt: '2024-06-01T10:01:00.000Z',
      artifactPaths: [],
      fsmState: 'dev',
      phaseId: 'phase-001',
    };
    const test = {
      runId: RUN_ID,
      phase: 'test',
      completedAt: '2024-06-01T10:05:00.000Z',
      artifactPaths: [],
      fsmState: 'test',
      phaseId: 'phase-002',
    };

    // Reverse-walk stops at test.json (later in sequence than dev)
    readFileMock.mockImplementation(async (filePath: unknown) => {
      if (String(filePath).endsWith('test.json')) return JSON.stringify(test);
      if (String(filePath).endsWith('dev.json')) return JSON.stringify(dev);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result!.phase).toBe('test');
  });

  it('returns null when no checkpoint files exist', async () => {
    readFileMock.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const store = makeStore([]);
    const manager = new CheckpointManager(store, RUN_ID);

    const result = await manager.getLastCompleted();

    expect(result).toBeNull();
  });
});
