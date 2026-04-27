/**
 * Integration tests for MOB-1065 — tsvector search migration & API
 *
 * Three test suites:
 *  1. Migration file (0005_search_vector.sql) — static SQL structure validation
 *  2. searchRuns() in forja-store.ts — pg pool mocked at module level
 *  3. GET /api/runs route — DB pool mocked, ?q= param forwarding
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=forks apps/ui/lib/search.integration.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// 1. Migration file — static SQL structure
// ---------------------------------------------------------------------------

describe('Migration 0005_search_vector.sql — static SQL structure', () => {
  let sql: string;

  beforeEach(async () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../../migrations/0005_search_vector.sql',
    );
    sql = await fs.readFile(migrationPath, 'utf-8');
  });

  it('migration file exists and is non-empty', () => {
    expect(sql.trim().length).toBeGreaterThan(0);
  });

  it('adds the search_vector tsvector column to runs', () => {
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+runs\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+search_vector\s+tsvector/i,
    );
  });

  it('creates a GIN index on runs.search_vector', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+runs_search_idx\s+ON\s+runs\s+USING\s+GIN\s*\(\s*search_vector\s*\)/i,
    );
  });

  it('creates an auxiliary index on cost_events(created_at)', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+cost_events_created_at_idx\s+ON\s+cost_events\s*\(\s*created_at\s*\)/i,
    );
  });

  it('defines the update_runs_search_vector() trigger function', () => {
    expect(sql).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+update_runs_search_vector\s*\(\s*\)/i,
    );
  });

  it('trigger function uses to_tsvector with english dictionary', () => {
    expect(sql).toMatch(/to_tsvector\s*\(\s*'english'/i);
  });

  it('trigger function concatenates issue_id and status columns', () => {
    expect(sql).toMatch(/coalesce\s*\(\s*NEW\.issue_id/i);
    expect(sql).toMatch(/coalesce\s*\(\s*NEW\.status::text/i);
  });

  it('trigger function returns NEW (required for BEFORE trigger)', () => {
    expect(sql).toMatch(/RETURN\s+NEW/i);
  });

  it('trigger function is written in plpgsql', () => {
    expect(sql).toMatch(/LANGUAGE\s+plpgsql/i);
  });

  it('drops any pre-existing trigger before re-creating it (idempotent)', () => {
    expect(sql).toMatch(
      /DROP\s+TRIGGER\s+IF\s+EXISTS\s+runs_search_vector_update\s+ON\s+runs/i,
    );
  });

  it('creates the BEFORE INSERT OR UPDATE trigger on runs', () => {
    expect(sql).toMatch(
      /CREATE\s+TRIGGER\s+runs_search_vector_update\s+BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+runs/i,
    );
  });

  it('trigger fires FOR EACH ROW', () => {
    expect(sql).toMatch(/FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+update_runs_search_vector/i);
  });

  it('backfills existing rows where search_vector IS NULL', () => {
    expect(sql).toMatch(/UPDATE\s+runs\s+SET\s+search_vector\s*=/i);
    expect(sql).toMatch(/WHERE\s+search_vector\s+IS\s+NULL/i);
  });

  it('backfill uses the same to_tsvector expression as the trigger', () => {
    // The UPDATE statement must also use to_tsvector('english', ...)
    const backfillMatch = sql.match(
      /UPDATE\s+runs[\s\S]*?WHERE\s+search_vector\s+IS\s+NULL/i,
    );
    expect(backfillMatch).not.toBeNull();
    expect(backfillMatch![0]).toMatch(/to_tsvector\s*\(\s*'english'/i);
  });

  it('contains down-migration comments for reversibility', () => {
    // The file should include commented-out DROP statements for manual rollback
    expect(sql).toMatch(/--\s*DROP\s+TRIGGER/i);
    expect(sql).toMatch(/--\s*DROP\s+FUNCTION/i);
    expect(sql).toMatch(/--\s*ALTER\s+TABLE\s+runs\s+DROP\s+COLUMN/i);
  });

  it('all DDL blocks are separated by --> statement-breakpoint markers', () => {
    // Drizzle migration convention: each statement preceded by --> statement-breakpoint
    const breakpoints = sql.match(/--> statement-breakpoint/g);
    // Expect at least 5 breakpoints (one per major DDL statement)
    expect(breakpoints).not.toBeNull();
    expect(breakpoints!.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// 2. searchRuns() — mock the pg Pool at the module level
// ---------------------------------------------------------------------------

// We mock the db module before importing forja-store so the store gets
// the mocked pool immediately. Vitest hoists vi.mock() calls automatically.
const mockQuery = vi.fn();
const mockPool = { query: mockQuery };

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(async () => mockPool),
}));

// Mock jsonl fallback so it never touches the file system
vi.mock('@/lib/jsonl-reader', () => ({
  listRunIds: vi.fn(async () => []),
  readRunEventsAll: vi.fn(async () => []),
  readRunSummaryEventsAll: vi.fn(async () => []),
  buildRunFromEvents: vi.fn(() => ({
    id: 'r1',
    issueId: 'MOB-1',
    status: 'done',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    totalCostUsd: '0',
    gateFinal: null,
  })),
}));

describe('searchRuns() — parameterized tsvector query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls db.query with a single positional parameter $1', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { searchRuns } = await import('@/lib/forja-store');
    await searchRuns('failed');

    expect(mockQuery).toHaveBeenCalledOnce();
    const [queryText, queryParams] = mockQuery.mock.calls[0] as [string, string[]];
    expect(queryParams).toHaveLength(1);
    expect(queryParams[0]).toBe('failed');
    // The placeholder must appear in the SQL text
    expect(queryText).toContain('$1');
  });

  it('uses plainto_tsquery with english dictionary', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { searchRuns } = await import('@/lib/forja-store');
    await searchRuns('my query');

    const [queryText] = mockQuery.mock.calls[0] as [string, string[]];
    expect(queryText).toMatch(/plainto_tsquery\s*\(\s*'english'\s*,\s*\$1\s*\)/i);
  });

  it('filters rows using the @@ full-text search operator', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { searchRuns } = await import('@/lib/forja-store');
    await searchRuns('spec');

    const [queryText] = mockQuery.mock.calls[0] as [string, string[]];
    expect(queryText).toMatch(/search_vector\s+@@\s+plainto_tsquery/i);
  });

  it('maps DB rows to RunSummary shape', async () => {
    const fakeRow = {
      id: 'abc123',
      issue_id: 'MOB-42',
      status: 'done' as const,
      started_at: '2024-01-01T00:00:00Z',
      finished_at: '2024-01-01T01:00:00Z',
      total_cost: '0.05',
      gate: 'pass' as const,
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

    const { searchRuns } = await import('@/lib/forja-store');
    const results = await searchRuns('MOB-42');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'abc123',
      issueId: 'MOB-42',
      status: 'done',
      totalCost: '0.05',
      gate: 'pass',
    });
  });

  it('durationMs is null when finished_at is null', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'r1', issue_id: 'MOB-1', status: 'dev',
        started_at: '2024-01-01T00:00:00Z', finished_at: null,
        total_cost: '0', gate: null,
      }],
    });

    const { searchRuns } = await import('@/lib/forja-store');
    const [run] = await searchRuns('dev');
    expect(run.durationMs).toBeNull();
  });

  it('durationMs is computed when finished_at is set', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'r2', issue_id: 'MOB-2', status: 'done',
        started_at: '2024-01-01T00:00:00.000Z',
        finished_at: '2024-01-01T00:01:00.000Z',
        total_cost: '0.01', gate: 'pass',
      }],
    });

    const { searchRuns } = await import('@/lib/forja-store');
    const [run] = await searchRuns('done');
    expect(run.durationMs).toBe(60_000);
  });

  it('falls back to JSONL filter when db.query throws', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB connection refused'));

    const { searchRuns } = await import('@/lib/forja-store');
    // Should not throw — falls back to JSONL (which returns [] for empty state)
    const results = await searchRuns('any');
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns empty array when no rows match', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const { searchRuns } = await import('@/lib/forja-store');
    const results = await searchRuns('nonexistent');
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. GET /api/runs route — ?q= param forwarding
// ---------------------------------------------------------------------------

// The route module imports 'next/server'. We provide a minimal mock so the
// test can run outside a Next.js runtime.
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      _json: data,
      _status: init?.status ?? 200,
    })),
  },
}));

describe('GET /api/runs route — ?q= search param handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure DATABASE_URL is set so the route takes the DB branch
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  async function callRoute(url: string) {
    const { GET } = await import('@/app/api/runs/route');
    return GET(new Request(url));
  }

  it('passes the q param as $1 in the parameterized WHERE clause', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await callRoute('http://localhost/api/runs?q=failed');

    expect(mockQuery).toHaveBeenCalledOnce();
    const [queryText, queryParams] = mockQuery.mock.calls[0] as [string, string[]];
    expect(queryParams).toEqual(['failed']);
    expect(queryText).toMatch(/WHERE\s+search_vector\s+@@\s+plainto_tsquery/i);
    expect(queryText).toContain('$1');
  });

  it('issues a query with NO WHERE clause when q is absent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await callRoute('http://localhost/api/runs');

    expect(mockQuery).toHaveBeenCalledOnce();
    const [queryText, queryParams] = mockQuery.mock.calls[0] as [string, string[]];
    expect(queryParams).toEqual([]);
    expect(queryText).not.toMatch(/WHERE/i);
  });

  it('truncates q to 200 characters before passing to DB', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const longQuery = 'a'.repeat(300);
    await callRoute(`http://localhost/api/runs?q=${longQuery}`);

    const [, queryParams] = mockQuery.mock.calls[0] as [string, string[]];
    expect(queryParams[0].length).toBe(200);
  });

  it('returns 200 with an array when DB query succeeds', async () => {
    const fakeRow = {
      id: 'run1', issue_id: 'MOB-10', started_at: '2024-01-01T00:00:00Z',
      finished_at: null, status: 'done', git_branch: 'main', git_sha: 'abc',
      model: 'claude-3', total_cost: '0.02', total_tokens: 1000,
      schema_version: '1.0',
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

    const response = await callRoute('http://localhost/api/runs?q=done') as {
      _json: unknown; _status: number
    };

    expect(response._status).toBe(200);
    expect(Array.isArray(response._json)).toBe(true);
    expect((response._json as unknown[]).length).toBe(1);
  });

  it('maps DB row snake_case to camelCase RunSummary fields', async () => {
    const fakeRow = {
      id: 'run2', issue_id: 'MOB-99', started_at: '2024-02-01T00:00:00Z',
      finished_at: '2024-02-01T01:00:00Z', status: 'pr', git_branch: 'feat/x',
      git_sha: 'deadbeef', model: 'claude-opus-4', total_cost: '1.23',
      total_tokens: 5000, schema_version: '2.0',
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

    const response = await callRoute('http://localhost/api/runs?q=pr') as {
      _json: unknown[]; _status: number
    };

    const run = response._json[0] as Record<string, unknown>;
    expect(run['issueId']).toBe('MOB-99');
    expect(run['gitBranch']).toBe('feat/x');
    expect(run['gitSha']).toBe('deadbeef');
    expect(run['totalCost']).toBe('1.23');
    expect(run['totalTokens']).toBe(5000);
    expect(run['schemaVersion']).toBe('2.0');
  });

  it('falls back to JSONL path when DATABASE_URL is absent', async () => {
    delete process.env.DATABASE_URL;
    // JSONL reader returns no run IDs → empty array response
    const response = await callRoute('http://localhost/api/runs?q=anything') as {
      _json: unknown; _status: number
    };
    expect(response._status).toBe(200);
    expect(response._json).toEqual([]);
    // DB must NOT have been called
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
