/**
 * E2E tests for MOB-1008 — `forja resume` CLI command.
 *
 * Tests:
 *   1. `forja resume <run-id>` exits with code 1 and prints an error when no checkpoint is found
 *   2. CheckpointManager correctly computes remaining phases from checkpoint state
 *   3. Checkpoint file format is correct (validate JSON schema of a written checkpoint)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';

import { CheckpointManager, type Checkpoint } from '../../src/engine/checkpoint.js';
import { PIPELINE_SEQUENCE } from '../../src/cli/commands/run.js';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Run, Phase } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const TSX = path.resolve('node_modules/.bin/tsx');
const CLI_ENTRY = path.resolve('tests/e2e/_resume-runner.ts');
const PROJECT_ROOT = path.resolve('.');

const RUN_ID_STUB = '00000000-0000-0000-0000-000000000042';
const ISO_NOW = '2025-01-15T10:00:00.000Z';

const createdRunIds: string[] = [];

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function runDir(runId: string): string {
  return path.join('forja', 'state', 'runs', runId);
}

function checkpointDir(runId: string): string {
  return path.join(runDir(runId), 'checkpoints');
}

/**
 * Spawn `forja resume <runId>` via tsx as a subprocess.
 */
function runResume(runId: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(TSX, [CLI_ENTRY, runId], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Force no-DB mode so the command doesn't attempt a real Postgres connection.
      // The command will fall back to reading local checkpoint files.
      FORJA_STORE: 'noop',
    },
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Build a minimal ForjaStore mock with controllable listPhases and getRun.
 */
function makeStore(phases: Phase[], run: Run | null = null): ForjaStore {
  return {
    getRun: vi.fn(async () => run),
    listPhases: vi.fn(async () => phases),
    // Unused stubs
    createRun: vi.fn(),
    updateRun: vi.fn(),
    listRuns: vi.fn(),
    createPhase: vi.fn(),
    updatePhase: vi.fn(),
    getPhase: vi.fn(),
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
    close: vi.fn(async () => {}),
  } as unknown as ForjaStore;
}

function makeRun(status: Run['status'] = 'dev'): Run {
  return {
    id: RUN_ID_STUB,
    issueId: 'MOB-1008',
    startedAt: ISO_NOW,
    finishedAt: null,
    status,
    gitBranch: null,
    gitSha: null,
    model: null,
    totalCost: '0',
    totalTokens: 0,
  };
}

function makePhase(name: string, overrides: Partial<Phase> = {}): Phase {
  return {
    id: randomUUID(),
    runId: RUN_ID_STUB,
    name,
    startedAt: ISO_NOW,
    finishedAt: ISO_NOW,
    status: 'completed',
    ...overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const runId of createdRunIds.splice(0)) {
    try {
      await fs.rm(runDir(runId), { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario 1a: CLI subprocess exits 1 when DB is unreachable
//   (resume command always initialises the store first; without a DB the
//    ping fails before any checkpoint logic is reached)
// ---------------------------------------------------------------------------

describe('E2E (subprocess): forja resume exits 1 when store is unreachable', () => {
  it('exits with code 1 when Postgres is not available', () => {
    const runId = makeRunId();
    // FORJA_STORE_URL points to an invalid host so the ping always fails
    const result = spawnSync(TSX, [CLI_ENTRY, runId], {
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
// Scenario 1b: module-level — resumeCommand action exits 1 and prints error
//   when CheckpointManager.getLastCompleted() returns null
// ---------------------------------------------------------------------------

describe('resumeCommand (module-level): exits 1 and prints error when no checkpoint found', () => {
  it('calls process.exit(1) and logs the expected error message', async () => {
    const runId = makeRunId();

    // Spy on process.exit so we can intercept without terminating the test runner
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Build a store that reports no completed phases → checkpoint will be null.
    // getRun must return a valid run so the command reaches the checkpoint lookup.
    const store = makeStore([], makeRun('dev'));

    // Patch createStoreFromConfig to return our mock store without a real DB
    const factoryModule = await import('../../src/store/factory.js');
    vi.spyOn(factoryModule, 'createStoreFromConfig').mockResolvedValue(store);

    // Import resumeCommand fresh (vitest caches modules, so we re-use the cached one)
    const { resumeCommand } = await import('../../src/cli/commands/resume.js');

    // Invoke the command's action handler directly
    await expect(
      resumeCommand.parseAsync(['node', 'resume', runId]),
    ).rejects.toThrow('process.exit(1)');

    // Verify the error message
    const errorCalls = errorSpy.mock.calls.flat().join(' ');
    expect(errorCalls).toContain('no checkpoint found');
    expect(errorCalls).toContain(runId);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: CheckpointManager.getLastCompleted() returns null → no phases
// ---------------------------------------------------------------------------

describe('CheckpointManager: getLastCompleted() returns null when store has no completed phases', () => {
  it('returns null when listPhases returns an empty array and no checkpoint files exist', async () => {
    const runId = makeRunId();
    const store = makeStore([]);
    const manager = new CheckpointManager(store, runId);

    const result = await manager.getLastCompleted();
    expect(result).toBeNull();
  });

  it('returns null when all phases are pending (not completed)', async () => {
    const runId = makeRunId();
    const store = makeStore([
      makePhase('dev', { status: 'running', finishedAt: null }),
      makePhase('test', { status: 'pending', finishedAt: null }),
    ]);
    const manager = new CheckpointManager(store, runId);

    const result = await manager.getLastCompleted();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: CheckpointManager correctly computes remaining phases
// ---------------------------------------------------------------------------

describe('CheckpointManager + PIPELINE_SEQUENCE: remaining phases after checkpoint', () => {
  it('returns all phases when the latest checkpoint is "dev" (first in sequence)', async () => {
    const runId = makeRunId();
    const store = makeStore([makePhase('dev')]);
    const manager = new CheckpointManager(store, runId);

    const checkpoint = await manager.getLastCompleted();
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.fsmState).toBe('dev');

    const lastIndex = PIPELINE_SEQUENCE.indexOf(checkpoint!.fsmState);
    const remaining = lastIndex >= 0 ? PIPELINE_SEQUENCE.slice(lastIndex + 1) : PIPELINE_SEQUENCE;

    // PIPELINE_SEQUENCE = ['dev', 'test', 'homolog', 'pr', 'done']
    expect(remaining).toEqual(['test', 'homolog', 'pr', 'done']);
  });

  it('returns only done when the latest checkpoint is "pr"', async () => {
    const runId = makeRunId();
    const store = makeStore([
      makePhase('dev', { finishedAt: '2025-01-15T09:00:00.000Z' }),
      makePhase('test', { finishedAt: '2025-01-15T09:30:00.000Z' }),
      makePhase('pr', { finishedAt: '2025-01-15T10:00:00.000Z' }),
    ]);
    const manager = new CheckpointManager(store, runId);

    const checkpoint = await manager.getLastCompleted();
    expect(checkpoint!.fsmState).toBe('pr');

    const lastIndex = PIPELINE_SEQUENCE.indexOf(checkpoint!.fsmState);
    const remaining = PIPELINE_SEQUENCE.slice(lastIndex + 1);

    expect(remaining).toEqual(['done']);
  });

  it('returns an empty array (nothing to resume) when the checkpoint is "done"', async () => {
    const runId = makeRunId();
    const store = makeStore([makePhase('done')]);
    const manager = new CheckpointManager(store, runId);

    const checkpoint = await manager.getLastCompleted();
    expect(checkpoint!.fsmState).toBe('done');

    const lastIndex = PIPELINE_SEQUENCE.indexOf(checkpoint!.fsmState);
    const remaining = lastIndex >= 0 ? PIPELINE_SEQUENCE.slice(lastIndex + 1) : PIPELINE_SEQUENCE;

    expect(remaining).toHaveLength(0);
  });

  it('picks the most recently completed phase when multiple phases are completed', async () => {
    const runId = makeRunId();
    const store = makeStore([
      makePhase('dev',  { finishedAt: '2025-01-15T08:00:00.000Z' }),
      makePhase('test', { finishedAt: '2025-01-15T09:00:00.000Z' }),
    ]);
    const manager = new CheckpointManager(store, runId);

    const checkpoint = await manager.getLastCompleted();
    // "test" has the latest finishedAt — it should be selected
    expect(checkpoint!.fsmState).toBe('test');

    const lastIndex = PIPELINE_SEQUENCE.indexOf(checkpoint!.fsmState);
    const remaining = PIPELINE_SEQUENCE.slice(lastIndex + 1);
    expect(remaining).toEqual(['homolog', 'pr', 'done']);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Checkpoint file format is correct (JSON schema validation)
// ---------------------------------------------------------------------------

describe('CheckpointManager.save(): checkpoint file format', () => {
  it('writes a valid checkpoint JSON file with all required fields', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();
    const store = makeStore([], makeRun('dev'));

    // Override updatePhase to avoid a real DB call
    (store.updatePhase as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: phaseId,
      runId,
      name: 'dev',
      startedAt: ISO_NOW,
      finishedAt: ISO_NOW,
      status: 'completed',
    });

    const manager = new CheckpointManager(store, runId);
    await manager.save('dev', phaseId);

    // Verify the file was written to the expected location
    const filePath = path.join(checkpointDir(runId), 'dev.json');
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    // Type-assert so we can inspect shape
    const cp = parsed as Record<string, unknown>;

    // Required fields
    expect(cp).toHaveProperty('runId', runId);
    expect(cp).toHaveProperty('phase', 'dev');
    expect(cp).toHaveProperty('fsmState', 'dev');
    expect(cp).toHaveProperty('phaseId', phaseId);
    expect(cp).toHaveProperty('completedAt');
    expect(cp).toHaveProperty('artifactPaths');

    // completedAt must be a valid ISO 8601 string
    expect(typeof cp['completedAt']).toBe('string');
    expect(new Date(cp['completedAt'] as string).getTime()).not.toBeNaN();

    // artifactPaths must be an array of strings
    expect(Array.isArray(cp['artifactPaths'])).toBe(true);
    const paths = cp['artifactPaths'] as string[];
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    }

    // The artifact paths should reference the correct run directory
    const runBase = path.join('forja', 'state', 'runs', runId);
    for (const p of paths) {
      expect(p).toContain(runBase);
    }
  });

  it('can round-trip: save then getLastCompleted returns the written checkpoint', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();

    // Store that returns the phase as completed after save
    const phase: Phase = {
      id: phaseId,
      runId,
      name: 'test',
      startedAt: ISO_NOW,
      finishedAt: ISO_NOW,
      status: 'completed',
    };
    const store = makeStore([phase], makeRun('test'));
    (store.updatePhase as ReturnType<typeof vi.fn>).mockResolvedValue(phase);

    const manager = new CheckpointManager(store, runId);
    await manager.save('test', phaseId);

    const checkpoint = await manager.getLastCompleted();
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.runId).toBe(runId);
    expect(checkpoint!.fsmState).toBe('test');
    expect(checkpoint!.phaseId).toBe(phaseId);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Fallback to local checkpoint files when store has no completed phases
// ---------------------------------------------------------------------------

describe('CheckpointManager: local file fallback when store returns no completed phases', () => {
  it('reads checkpoint from local JSON file when store phases list is empty', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();

    // Store has no completed phases — forces fallback to local files
    const store = makeStore([]);

    // Manually write a checkpoint file to simulate a persisted one
    const dir = checkpointDir(runId);
    await fs.mkdir(dir, { recursive: true });
    const cp: Checkpoint = {
      runId,
      phase: 'homolog',
      completedAt: ISO_NOW,
      artifactPaths: [path.join('forja', 'state', 'runs', runId, 'trace.jsonl')],
      fsmState: 'homolog',
      phaseId,
    };
    await fs.writeFile(path.join(dir, 'homolog.json'), JSON.stringify(cp, null, 2), 'utf8');

    const manager = new CheckpointManager(store, runId);
    const result = await manager.getLastCompleted();

    expect(result).not.toBeNull();
    expect(result!.fsmState).toBe('homolog');
    expect(result!.runId).toBe(runId);
    expect(result!.phaseId).toBe(phaseId);
  });

  it('picks the most recent file when multiple checkpoint files exist', async () => {
    const runId = makeRunId();
    const store = makeStore([]);

    const dir = checkpointDir(runId);
    await fs.mkdir(dir, { recursive: true });

    const older: Checkpoint = {
      runId,
      phase: 'dev',
      completedAt: '2025-01-15T08:00:00.000Z',
      artifactPaths: [],
      fsmState: 'dev',
      phaseId: randomUUID(),
    };
    const newer: Checkpoint = {
      runId,
      phase: 'test',
      completedAt: '2025-01-15T09:00:00.000Z',
      artifactPaths: [],
      fsmState: 'test',
      phaseId: randomUUID(),
    };

    await fs.writeFile(path.join(dir, 'dev.json'), JSON.stringify(older, null, 2), 'utf8');
    await fs.writeFile(path.join(dir, 'test.json'), JSON.stringify(newer, null, 2), 'utf8');

    const manager = new CheckpointManager(store, runId);
    const result = await manager.getLastCompleted();

    expect(result!.fsmState).toBe('test');
  });
});
