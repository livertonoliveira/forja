/**
 * Unit tests for searchRuns() in apps/ui/lib/forja-store.ts
 *
 * Covers:
 * - DB mode: sends SQL with plainto_tsquery and LIMIT 100
 * - DB mode: maps rows to RunSummary correctly (including durationMs)
 * - DB mode: falls back to JSONL when DB query throws
 * - No-DB mode: falls back to JSONL filter by issueId and status (case-insensitive)
 * - JSONL fallback: returns empty array when no runs match
 * - JSONL fallback: matches issueId substring
 * - JSONL fallback: matches status substring
 * - JSONL fallback: does NOT match unrelated fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock setup — vi.mock must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../apps/ui/lib/jsonl-reader.ts', () => ({
  listRunIds: vi.fn(),
  readRunEventsAll: vi.fn(),
  readRunSummaryEventsAll: vi.fn(),
  buildRunFromEvents: vi.fn(),
}));

vi.mock('../../apps/ui/lib/db.ts', () => ({
  getPool: vi.fn(),
}));

import { searchRuns } from '../../apps/ui/lib/forja-store.ts';
import { listRunIds, readRunSummaryEventsAll, buildRunFromEvents } from '../../apps/ui/lib/jsonl-reader.ts';
import { getPool } from '../../apps/ui/lib/db.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const mockedGetPool = vi.mocked(getPool);
const mockedListRunIds = vi.mocked(listRunIds);
const mockedReadRunSummaryEventsAll = vi.mocked(readRunSummaryEventsAll);
const mockedBuildRunFromEvents = vi.mocked(buildRunFromEvents);

function makeDbRow(overrides: Partial<{
  id: string;
  issue_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  total_cost: string;
  gate: string | null;
}> = {}) {
  return {
    id: RUN_A,
    issue_id: 'MOB-1065',
    status: 'done',
    started_at: '2024-01-01T00:00:00.000Z',
    finished_at: '2024-01-01T00:01:00.000Z',
    total_cost: '0.001234',
    gate: 'pass',
    ...overrides,
  };
}

function makeJsonlRun(overrides: Partial<{
  id: string;
  issueId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalCostUsd: string;
  gateFinal: string | null;
}> = {}) {
  return {
    id: RUN_A,
    issueId: 'MOB-1065',
    status: 'done',
    startedAt: '2024-01-01T00:00:00.000Z',
    finishedAt: null,
    totalCostUsd: '0.001234',
    gateFinal: null,
    totalTokens: 0,
    gitBranch: null,
    gitSha: null,
    model: null,
    schemaVersion: '1.0',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// DB mode — SQL correctness
// ---------------------------------------------------------------------------

describe('searchRuns — DB mode SQL', () => {
  it('calls db.query with plainto_tsquery and LIMIT 100', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await searchRuns('MOB-1065');

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('plainto_tsquery');
    expect(sql).toContain('LIMIT 100');
    expect(params).toEqual(['MOB-1065']);
  });

  it('uses search_vector @@ plainto_tsquery operator in WHERE clause', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await searchRuns('full text search');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('search_vector @@');
    expect(sql).toContain("plainto_tsquery('english', $1)");
  });

  it('passes the raw query string as the first parameter', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await searchRuns('  my search term  ');

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('  my search term  ');
  });

  it('returns empty array when DB returns zero rows', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const result = await searchRuns('nothing');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DB mode — row mapping
// ---------------------------------------------------------------------------

describe('searchRuns — DB mode row mapping', () => {
  it('maps DB row fields to RunSummary correctly', async () => {
    const row = makeDbRow();
    const mockQuery = vi.fn().mockResolvedValue({ rows: [row] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const [result] = await searchRuns('MOB-1065');

    expect(result.id).toBe(row.id);
    expect(result.issueId).toBe(row.issue_id);
    expect(result.status).toBe(row.status);
    expect(result.startedAt).toBe(row.started_at);
    expect(result.finishedAt).toBe(row.finished_at);
    expect(result.totalCost).toBe(row.total_cost);
    expect(result.gate).toBe(row.gate);
  });

  it('computes durationMs from startedAt and finishedAt when finishedAt is present', async () => {
    const row = makeDbRow({
      started_at: '2024-01-01T00:00:00.000Z',
      finished_at: '2024-01-01T00:01:00.000Z',
    });
    const mockQuery = vi.fn().mockResolvedValue({ rows: [row] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const [result] = await searchRuns('MOB-1065');

    expect(result.durationMs).toBe(60_000);
  });

  it('sets durationMs to null when finishedAt is null', async () => {
    const row = makeDbRow({ finished_at: null });
    const mockQuery = vi.fn().mockResolvedValue({ rows: [row] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const [result] = await searchRuns('running');

    expect(result.durationMs).toBeNull();
  });

  it('maps gate=null row correctly', async () => {
    const row = makeDbRow({ gate: null });
    const mockQuery = vi.fn().mockResolvedValue({ rows: [row] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const [result] = await searchRuns('pending');

    expect(result.gate).toBeNull();
  });

  it('returns multiple rows in order returned by DB', async () => {
    const rows = [makeDbRow({ id: 'id-1' }), makeDbRow({ id: 'id-2' })];
    const mockQuery = vi.fn().mockResolvedValue({ rows });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const result = await searchRuns('MOB');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('id-1');
    expect(result[1].id).toBe('id-2');
  });
});

// ---------------------------------------------------------------------------
// DB mode — fallback on error
// ---------------------------------------------------------------------------

describe('searchRuns — DB mode fallback on query error', () => {
  it('falls back to JSONL filter when DB query throws', async () => {
    const mockQuery = vi.fn().mockRejectedValue(new Error('connection refused'));
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const jsonlRun = makeJsonlRun({ issueId: 'MOB-1065', status: 'done' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunSummaryEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(jsonlRun as never);

    const result = await searchRuns('MOB-1065');

    // Fallback JSONL filter matches issueId 'MOB-1065' against query 'MOB-1065'
    expect(result).toHaveLength(1);
    expect(result[0].issueId).toBe('MOB-1065');
  });

  it('returns empty array from JSONL fallback when no runs match after DB error', async () => {
    const mockQuery = vi.fn().mockRejectedValue(new Error('timeout'));
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const jsonlRun = makeJsonlRun({ issueId: 'MOB-9999', status: 'failed' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunSummaryEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(jsonlRun as never);

    const result = await searchRuns('MOB-1065');

    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// No-DB mode — JSONL fallback filtering
// ---------------------------------------------------------------------------

describe('searchRuns — no-DB mode (getPool returns null)', () => {
  beforeEach(() => {
    mockedGetPool.mockResolvedValue(null);
  });

  it('filters runs by issueId substring (case-insensitive)', async () => {
    const run = makeJsonlRun({ issueId: 'MOB-1065', status: 'done' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunSummaryEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(run as never);

    const result = await searchRuns('mob-1065');

    expect(result).toHaveLength(1);
    expect(result[0].issueId).toBe('MOB-1065');
  });

  it('filters runs by status substring (case-insensitive)', async () => {
    const run = makeJsonlRun({ issueId: 'MOB-42', status: 'failed' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunSummaryEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(run as never);

    const result = await searchRuns('FAIL');

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('failed');
  });

  it('returns empty array when no runs match the query', async () => {
    const run = makeJsonlRun({ issueId: 'MOB-42', status: 'done' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunSummaryEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(run as never);

    const result = await searchRuns('xyzzy-no-match');

    expect(result).toHaveLength(0);
  });

  it('returns all matching runs when multiple runs match', async () => {
    const runA = makeJsonlRun({ id: 'id-a', issueId: 'MOB-100', status: 'done' });
    const runB = makeJsonlRun({ id: 'id-b', issueId: 'MOB-101', status: 'done' });
    mockedListRunIds.mockResolvedValue(['id-a', 'id-b']);
    mockedReadRunSummaryEventsAll.mockResolvedValue([[], []]);
    mockedBuildRunFromEvents
      .mockReturnValueOnce(runA as never)
      .mockReturnValueOnce(runB as never);

    const result = await searchRuns('MOB-10');

    expect(result).toHaveLength(2);
  });

  it('returns empty array when there are no runs at all', async () => {
    mockedListRunIds.mockResolvedValue([]);
    mockedReadRunSummaryEventsAll.mockResolvedValue([]);

    const result = await searchRuns('anything');

    expect(result).toHaveLength(0);
  });

  it('does not match on totalCost or other non-indexed fields', async () => {
    const run = makeJsonlRun({ issueId: 'MOB-99', status: 'done', totalCostUsd: '9.99' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunSummaryEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(run as never);

    // Searching by cost value — not indexed in JSONL fallback
    const result = await searchRuns('9.99');

    expect(result).toHaveLength(0);
  });
});
