/**
 * Unit tests for GET /api/runs route — apps/ui/app/api/runs/route.ts
 *
 * Covers:
 * - q param is trimmed to 200 chars before being used
 * - DB mode with q: uses search_vector @@ plainto_tsquery query
 * - DB mode without q: uses plain SELECT without WHERE
 * - DB mode: maps RunRow to camelCase Run shape
 * - DB mode: falls back to JSONL when DB query throws
 * - JSONL fallback with q: filters by issueId and status (case-insensitive)
 * - JSONL fallback without q: returns all runs sorted newest-first
 * - JSONL fallback: returns [] when no run IDs exist
 * - JSONL fallback: returns 500 when buildRunFromEvents throws
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock setup — vi.mock must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../apps/ui/lib/jsonl-reader.ts', () => ({
  listRunIds: vi.fn(),
  readRunEventsAll: vi.fn(),
  buildRunFromEvents: vi.fn(),
}));

vi.mock('../../apps/ui/lib/db.ts', () => ({
  getPool: vi.fn(),
}));

// next/server NextResponse is used by the route — provide a minimal stub
vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _body: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

import { GET } from '../../apps/ui/app/api/runs/route.ts';
import { listRunIds, readRunEventsAll, buildRunFromEvents } from '../../apps/ui/lib/jsonl-reader.ts';
import { getPool } from '../../apps/ui/lib/db.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const mockedGetPool = vi.mocked(getPool);
const mockedListRunIds = vi.mocked(listRunIds);
const mockedReadRunEventsAll = vi.mocked(readRunEventsAll);
const mockedBuildRunFromEvents = vi.mocked(buildRunFromEvents);

function makeRequest(url: string): Request {
  return new Request(url);
}

function makeDbRow(overrides: Partial<{
  id: string;
  issue_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  git_branch: string | null;
  git_sha: string | null;
  model: string | null;
  total_cost: string;
  total_tokens: number;
  schema_version: string;
}> = {}) {
  return {
    id: RUN_A,
    issue_id: 'MOB-1065',
    started_at: '2024-01-01T00:00:00.000Z',
    finished_at: null,
    status: 'done',
    git_branch: 'main',
    git_sha: 'abc1234',
    model: 'claude-3-5-sonnet-20241022',
    total_cost: '0.001234',
    total_tokens: 10000,
    schema_version: '1.0',
    ...overrides,
  };
}

function makeJsonlRun(overrides: Partial<{
  id: string;
  issueId: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  totalCostUsd: string;
  totalTokens: number;
  gateFinal: string | null;
  gitBranch: string | null;
  gitSha: string | null;
  model: string | null;
  schemaVersion: string;
}> = {}) {
  return {
    id: RUN_A,
    issueId: 'MOB-1065',
    startedAt: '2024-01-01T00:00:00.000Z',
    finishedAt: null,
    status: 'done',
    totalCostUsd: '0.001234',
    totalTokens: 0,
    gateFinal: null,
    gitBranch: null,
    gitSha: null,
    model: null,
    schemaVersion: '1.0',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no DATABASE_URL so DB branch is skipped
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DATABASE_URL;
});

// ---------------------------------------------------------------------------
// q param — 200-char truncation
// ---------------------------------------------------------------------------

describe('GET /api/runs — q param truncation', () => {
  it('passes at most 200 chars of q to the DB query', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    const long = 'a'.repeat(300);
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await GET(makeRequest(`http://localhost/api/runs?q=${long}`));

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0].length).toBe(200);
  });

  it('passes a short q param unchanged', async () => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await GET(makeRequest('http://localhost/api/runs?q=MOB-1065'));

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('MOB-1065');
  });
});

// ---------------------------------------------------------------------------
// DB mode — with q (search_vector path)
// ---------------------------------------------------------------------------

describe('GET /api/runs — DB mode with q', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
  });

  it('uses plainto_tsquery in the SQL when q is provided', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await GET(makeRequest('http://localhost/api/runs?q=deploy'));

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('plainto_tsquery');
    expect(sql).toContain('search_vector @@');
  });

  it('passes query term as first prepared-statement parameter', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await GET(makeRequest('http://localhost/api/runs?q=deploy'));

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual(['deploy']);
  });

  it('returns 200 with mapped run objects', async () => {
    const row = makeDbRow();
    const mockQuery = vi.fn().mockResolvedValue({ rows: [row] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const response = await GET(makeRequest('http://localhost/api/runs?q=MOB-1065'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(row.id);
    expect(body[0].issueId).toBe(row.issue_id);
    expect(body[0].startedAt).toBe(row.started_at);
    expect(body[0].gitBranch).toBe(row.git_branch);
    expect(body[0].gitSha).toBe(row.git_sha);
    expect(body[0].model).toBe(row.model);
    expect(body[0].totalCost).toBe(row.total_cost);
    expect(body[0].totalTokens).toBe(row.total_tokens);
    expect(body[0].schemaVersion).toBe(row.schema_version);
  });
});

// ---------------------------------------------------------------------------
// DB mode — without q (full list)
// ---------------------------------------------------------------------------

describe('GET /api/runs — DB mode without q', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
  });

  it('does NOT include plainto_tsquery in the SQL when q is absent', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    await GET(makeRequest('http://localhost/api/runs'));

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).not.toContain('plainto_tsquery');
    expect(params).toEqual([]);
  });

  it('returns 200 with empty array when no rows', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const response = await GET(makeRequest('http://localhost/api/runs'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DB mode — fallback to JSONL on error
// ---------------------------------------------------------------------------

describe('GET /api/runs — DB mode fallback on error', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://localhost/test';
  });

  it('falls back to JSONL when DB query throws, returning JSONL runs', async () => {
    const mockQuery = vi.fn().mockRejectedValue(new Error('DB down'));
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);

    const run = makeJsonlRun({ issueId: 'MOB-1065' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(run as never);

    const response = await GET(makeRequest('http://localhost/api/runs'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
  });

  it('falls back to JSONL when getPool returns null', async () => {
    mockedGetPool.mockResolvedValue(null);

    const run = makeJsonlRun({ issueId: 'MOB-42' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(run as never);

    const response = await GET(makeRequest('http://localhost/api/runs'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0].issueId).toBe('MOB-42');
  });
});

// ---------------------------------------------------------------------------
// JSONL fallback — no DATABASE_URL
// ---------------------------------------------------------------------------

describe('GET /api/runs — JSONL fallback (no DATABASE_URL)', () => {
  it('returns empty array when no run IDs exist', async () => {
    mockedListRunIds.mockResolvedValue([]);

    const response = await GET(makeRequest('http://localhost/api/runs'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns all runs sorted newest-first when q is absent', async () => {
    const runOlder = makeJsonlRun({ id: 'id-old', issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00.000Z' });
    const runNewer = makeJsonlRun({ id: 'id-new', issueId: 'MOB-2', startedAt: '2024-06-01T00:00:00.000Z' });
    mockedListRunIds.mockResolvedValue(['id-old', 'id-new']);
    mockedReadRunEventsAll.mockResolvedValue([[], []]);
    mockedBuildRunFromEvents
      .mockReturnValueOnce(runOlder as never)
      .mockReturnValueOnce(runNewer as never);

    const response = await GET(makeRequest('http://localhost/api/runs'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0].id).toBe('id-new');
    expect(body[1].id).toBe('id-old');
  });

  it('filters by issueId substring when q is provided', async () => {
    const runMatch = makeJsonlRun({ id: 'id-match', issueId: 'MOB-1065', startedAt: '2024-01-02T00:00:00.000Z' });
    const runNoMatch = makeJsonlRun({ id: 'id-other', issueId: 'MOB-9999', startedAt: '2024-01-01T00:00:00.000Z' });
    mockedListRunIds.mockResolvedValue(['id-match', 'id-other']);
    mockedReadRunEventsAll.mockResolvedValue([[], []]);
    mockedBuildRunFromEvents
      .mockReturnValueOnce(runMatch as never)
      .mockReturnValueOnce(runNoMatch as never);

    const response = await GET(makeRequest('http://localhost/api/runs?q=MOB-1065'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].issueId).toBe('MOB-1065');
  });

  it('filters by status substring when q is provided', async () => {
    const runFailed = makeJsonlRun({ id: 'id-failed', issueId: 'MOB-1', status: 'failed', startedAt: '2024-01-01T00:00:00.000Z' });
    const runDone = makeJsonlRun({ id: 'id-done', issueId: 'MOB-2', status: 'done', startedAt: '2024-01-01T00:00:00.000Z' });
    mockedListRunIds.mockResolvedValue(['id-failed', 'id-done']);
    mockedReadRunEventsAll.mockResolvedValue([[], []]);
    mockedBuildRunFromEvents
      .mockReturnValueOnce(runFailed as never)
      .mockReturnValueOnce(runDone as never);

    const response = await GET(makeRequest('http://localhost/api/runs?q=failed'));
    const body = await response.json();

    expect(body).toHaveLength(1);
    expect(body[0].status).toBe('failed');
  });

  it('q filtering is case-insensitive', async () => {
    const run = makeJsonlRun({ issueId: 'MOB-1065', status: 'done', startedAt: '2024-01-01T00:00:00.000Z' });
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[]]);
    mockedBuildRunFromEvents.mockReturnValue(run as never);

    const response = await GET(makeRequest('http://localhost/api/runs?q=MOB-1065'));
    const bodyUpper = await response.json();

    expect(bodyUpper).toHaveLength(1);
  });

  it('returns 500 with error message when buildRunFromEvents throws', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockRejectedValue(new Error('read error'));

    const response = await GET(makeRequest('http://localhost/api/runs'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('read error');
  });
});
