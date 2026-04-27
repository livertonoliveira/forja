/**
 * Unit tests for MOB-1001 — retention/prune feature
 *
 * Tests:
 *  - pruneRuns() with a mock ForjaStore
 *  - ConfigSchema.shape.retentionDays default value
 *  - loadConfig() retentionDays default when no config exists
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ForjaStore } from '../../src/store/interface.js';

// ---------------------------------------------------------------------------
// Mock 'node:fs/promises' before importing modules that use it
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises');

import fs from 'node:fs/promises';
import { pruneRuns } from '../../src/store/retention.js';
import { ConfigSchema } from '../../src/schemas/config.js';
import { loadConfig, clearConfigCache } from '../../src/config/loader.js';

const mockedFs = vi.mocked(fs);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockStore(overrides: Partial<Pick<ForjaStore, 'deleteRunsBefore'>> = {}): ForjaStore {
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
    linkIssue: vi.fn(),
    listIssueLinks: vi.fn(),
    deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: [] }),
    ping: vi.fn(),
    close: vi.fn(),
    ...overrides,
  } as unknown as ForjaStore;
}

// ---------------------------------------------------------------------------
// pruneRuns — empty result
// ---------------------------------------------------------------------------

describe('pruneRuns() — empty result', () => {
  it('returns zero counts when deleteRunsBefore returns no runIds', async () => {
    const store = buildMockStore({
      deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: [] }),
    });

    const before = new Date('2026-01-01T00:00:00Z');
    const result = await pruneRuns(store, { beforeDate: before });

    expect(result).toEqual({ deletedRuns: 0, freedBytes: 0 });
  });

  it('does not attempt any fs operations when runIds is empty', async () => {
    const store = buildMockStore({
      deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: [] }),
    });

    const before = new Date('2026-01-01T00:00:00Z');
    await pruneRuns(store, { beforeDate: before });

    expect(mockedFs.rm).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pruneRuns — dryRun: true
// ---------------------------------------------------------------------------

describe('pruneRuns() — dryRun: true', () => {
  beforeEach(() => {
    mockedFs.readdir.mockResolvedValue([]);
    mockedFs.rm.mockResolvedValue(undefined);
  });

  it('passes dryRun: true to deleteRunsBefore', async () => {
    const deleteRunsBefore = vi.fn().mockResolvedValue({ runIds: ['run-1'] });
    const store = buildMockStore({ deleteRunsBefore });

    const before = new Date('2026-01-01T00:00:00Z');
    await pruneRuns(store, { beforeDate: before, dryRun: true });

    expect(deleteRunsBefore).toHaveBeenCalledWith(before, { dryRun: true });
  });

  it('does NOT call fs.rm when dryRun is true', async () => {
    const store = buildMockStore({
      deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: ['run-1', 'run-2'] }),
    });

    await pruneRuns(store, { beforeDate: new Date(), dryRun: true });

    expect(mockedFs.rm).not.toHaveBeenCalled();
  });

  it('still returns correct deletedRuns count on dryRun', async () => {
    const store = buildMockStore({
      deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: ['run-a', 'run-b'] }),
    });

    const result = await pruneRuns(store, { beforeDate: new Date(), dryRun: true });

    expect(result.deletedRuns).toBe(2);
    expect(result.freedBytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// pruneRuns — dryRun: false (real deletion)
// ---------------------------------------------------------------------------

describe('pruneRuns() — dryRun: false', () => {
  beforeEach(() => {
    mockedFs.readdir.mockResolvedValue([]);
    mockedFs.rm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls fs.rm for each returned runId', async () => {
    const id1 = '00000000-0000-4000-8000-000000000001';
    const id2 = '00000000-0000-4000-8000-000000000002';
    const store = buildMockStore({
      deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: [id1, id2] }),
    });

    await pruneRuns(store, {
      beforeDate: new Date(),
      dryRun: false,
      stateDir: '/tmp/state/runs',
    });

    expect(mockedFs.rm).toHaveBeenCalledTimes(2);
    expect(mockedFs.rm).toHaveBeenCalledWith(`/tmp/state/runs/${id1}`, { recursive: true });
    expect(mockedFs.rm).toHaveBeenCalledWith(`/tmp/state/runs/${id2}`, { recursive: true });
  });

  it('returns deletedRuns equal to the number of runIds', async () => {
    const store = buildMockStore({
      deleteRunsBefore: vi.fn().mockResolvedValue({ runIds: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ] }),
    });

    const result = await pruneRuns(store, {
      beforeDate: new Date(),
      dryRun: false,
      stateDir: '/tmp/state/runs',
    });

    expect(result.deletedRuns).toBe(3);
  });

  it('passes beforeDate through to deleteRunsBefore unchanged', async () => {
    const deleteRunsBefore = vi.fn().mockResolvedValue({ runIds: [] });
    const store = buildMockStore({ deleteRunsBefore });

    const before = new Date('2025-06-15T12:00:00Z');
    await pruneRuns(store, { beforeDate: before, dryRun: false });

    expect(deleteRunsBefore).toHaveBeenCalledWith(before, { dryRun: false });
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema — retentionDays default
// ---------------------------------------------------------------------------

describe('ConfigSchema — retentionDays default', () => {
  it('defaults to 90 when value is undefined', () => {
    const result = ConfigSchema.shape.retentionDays.parse(undefined);
    expect(result).toBe(90);
  });

  it('accepts an explicit integer value', () => {
    const result = ConfigSchema.shape.retentionDays.parse(30);
    expect(result).toBe(30);
  });

  it('rejects non-integer numbers', () => {
    expect(() => ConfigSchema.shape.retentionDays.parse(3.5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadConfig — retentionDays default
// ---------------------------------------------------------------------------

describe('loadConfig() — retentionDays default', () => {
  beforeEach(() => {
    delete process.env.FORJA_STORE_URL;
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.FORJA_STORE_URL;
    clearConfigCache();
  });

  it('returns retentionDays of 90 when no config files exist and no env var is set', async () => {
    mockedFs.readFile
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockRejectedValueOnce(new Error('ENOENT'));

    const config = await loadConfig();

    expect(config.retentionDays).toBe(90);
  });

  it('returns retentionDays of 90 when config files have no retentionDays field', async () => {
    mockedFs.readFile
      .mockResolvedValueOnce(JSON.stringify({ storeUrl: 'postgresql://host/db' }) as unknown as Buffer)
      .mockResolvedValueOnce(JSON.stringify({}) as unknown as Buffer);

    const config = await loadConfig();

    expect(config.retentionDays).toBe(90);
  });

  it('returns retentionDays from project config when set', async () => {
    mockedFs.readFile
      .mockResolvedValueOnce(JSON.stringify({ storeUrl: 'postgresql://host/db', retentionDays: 30 }) as unknown as Buffer);

    const config = await loadConfig();

    expect(config.retentionDays).toBe(30);
  });

  it('falls back to user config retentionDays when project config has none', async () => {
    mockedFs.readFile
      .mockResolvedValueOnce(JSON.stringify({ storeUrl: 'postgresql://host/db' }) as unknown as Buffer)
      .mockResolvedValueOnce(JSON.stringify({ retentionDays: 60 }) as unknown as Buffer);

    const config = await loadConfig();

    expect(config.retentionDays).toBe(60);
  });
});
