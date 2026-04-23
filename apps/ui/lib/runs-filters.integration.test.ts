/**
 * Integration tests for MOB-1066 — filter UI with nuqs URL query params
 *
 * Two test suites:
 *  1. listRuns() in forja-store.ts — DB pool mocked to null (JSONL fallback path)
 *     - gate filter returns only matching runs
 *     - from filter excludes runs before the date
 *     - q filter matches issueId
 *     - multiple filters applied together (AND logic)
 *  2. searchParams → RunFilters mapping in runs/page.tsx
 *     - gate as comma-separated string → array
 *     - gate as array → array (no-op)
 *
 * Run:
 *   cd apps/ui && npx vitest run --pool=threads runs-filters.integration.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any import of the SUT
// ---------------------------------------------------------------------------

// Mock the DB pool to return null so listRuns always uses the JSONL fallback
vi.mock('@/lib/db', () => ({
  getPool: vi.fn(async () => null),
}));

// Controlled JSONL data — three runs covering all filter scenarios
const RUN_PASS = {
  id: 'run-pass-0001-0000-0000-000000000001',
  issueId: 'MOB-1066',
  status: 'done',
  startedAt: '2026-03-15T10:00:00.000Z',
  finishedAt: '2026-03-15T10:30:00.000Z',
  totalCostUsd: '0.10',
  gateFinal: 'pass',
};

const RUN_WARN = {
  id: 'run-warn-0002-0000-0000-000000000002',
  issueId: 'MOB-1055',
  status: 'review',
  startedAt: '2026-02-01T08:00:00.000Z',
  finishedAt: null,
  totalCostUsd: '0.05',
  gateFinal: 'warn',
};

const RUN_FAIL_OLD = {
  id: 'run-fail-0003-0000-0000-000000000003',
  issueId: 'MOB-999',
  status: 'failed',
  startedAt: '2025-12-01T06:00:00.000Z',
  finishedAt: '2025-12-01T06:05:00.000Z',
  totalCostUsd: '0.01',
  gateFinal: 'fail',
};

const ALL_RUNS = [RUN_PASS, RUN_WARN, RUN_FAIL_OLD];

vi.mock('@/lib/jsonl-reader', () => ({
  listRunIds: vi.fn(async () => ALL_RUNS.map((r) => r.id)),
  readRunEventsAll: vi.fn(async () => ALL_RUNS.map(() => [])),
  readRunSummaryEventsAll: vi.fn(async () => ALL_RUNS.map(() => [])),
  buildRunFromEvents: vi.fn((_runId: string, _events: unknown[]) => {
    // Return the controlled fixture that matches the runId being built
    const fixture = ALL_RUNS.find((r) => r.id === _runId);
    return fixture ?? ALL_RUNS[0];
  }),
}));

// ---------------------------------------------------------------------------
// 1. listRuns() — JSONL fallback with filters
// ---------------------------------------------------------------------------

describe('listRuns() — JSONL fallback path with RunFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gate=["pass"] returns only runs with gate pass', async () => {
    const { listRuns } = await import('@/lib/forja-store');
    const results = await listRuns({ gate: ['pass'] });

    expect(results.length).toBe(1);
    expect(results[0].issueId).toBe('MOB-1066');
    expect(results[0].gate).toBe('pass');
  });

  it('gate=["pass","warn"] returns runs with pass or warn (compound gate filter)', async () => {
    const { listRuns } = await import('@/lib/forja-store');
    const results = await listRuns({ gate: ['pass', 'warn'] });

    expect(results.length).toBe(2);
    const gates = results.map((r) => r.gate);
    expect(gates).toContain('pass');
    expect(gates).toContain('warn');
    expect(gates).not.toContain('fail');
  });

  it('from=2026-01-01 excludes runs before that date', async () => {
    const { listRuns } = await import('@/lib/forja-store');
    const results = await listRuns({ from: '2026-01-01' });

    // RUN_FAIL_OLD started in 2025 — must be excluded
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain(RUN_FAIL_OLD.id);
    // RUN_PASS (2026-03) and RUN_WARN (2026-02) must be included
    expect(ids).toContain(RUN_PASS.id);
    expect(ids).toContain(RUN_WARN.id);
  });

  it('q="MOB-1066" matches by issueId', async () => {
    const { listRuns } = await import('@/lib/forja-store');
    const results = await listRuns({ q: 'MOB-1066' });

    expect(results.length).toBe(1);
    expect(results[0].issueId).toBe('MOB-1066');
  });

  it('multiple filters applied together (AND logic): gate=pass AND from=2026-01-01', async () => {
    const { listRuns } = await import('@/lib/forja-store');
    const results = await listRuns({ gate: ['pass'], from: '2026-01-01' });

    // Only RUN_PASS satisfies both: gate=pass AND startedAt >= 2026-01-01
    expect(results.length).toBe(1);
    expect(results[0].id).toBe(RUN_PASS.id);
  });

  it('multiple filters: q="MOB-999" AND gate=["pass"] returns empty (AND logic)', async () => {
    const { listRuns } = await import('@/lib/forja-store');
    const results = await listRuns({ q: 'MOB-999', gate: ['pass'] });

    // MOB-999 has gate=fail, so the combined filter produces no results
    expect(results).toEqual([]);
  });

  it('empty filters returns all runs', async () => {
    const { listRuns } = await import('@/lib/forja-store');
    const results = await listRuns({});

    expect(results.length).toBe(ALL_RUNS.length);
  });
});

// ---------------------------------------------------------------------------
// 2. searchParams → RunFilters mapping (runs/page.tsx logic, extracted inline)
// ---------------------------------------------------------------------------

/**
 * The mapping logic from runs/page.tsx reproduced here for unit testing
 * without requiring a Next.js render environment.
 */
function buildFilters(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const filters: { q?: string; from?: string; to?: string; gate?: string[] } =
    {};

  if (searchParams.q) filters.q = String(searchParams.q);
  if (searchParams.from) filters.from = String(searchParams.from);
  if (searchParams.to) filters.to = String(searchParams.to);
  if (searchParams.gate) {
    filters.gate = Array.isArray(searchParams.gate)
      ? searchParams.gate
      : String(searchParams.gate).split(',');
  }

  return filters;
}

describe('searchParams → RunFilters mapping (runs/page.tsx)', () => {
  it('gate as comma-separated string "pass,fail" → gate=["pass","fail"]', () => {
    const filters = buildFilters({ gate: 'pass,fail' });
    expect(filters.gate).toEqual(['pass', 'fail']);
  });

  it('gate as array ["pass","fail"] → gate=["pass","fail"] (unchanged)', () => {
    const filters = buildFilters({ gate: ['pass', 'fail'] });
    expect(filters.gate).toEqual(['pass', 'fail']);
  });

  it('gate as single string "warn" → gate=["warn"]', () => {
    const filters = buildFilters({ gate: 'warn' });
    expect(filters.gate).toEqual(['warn']);
  });

  it('q is forwarded as string', () => {
    const filters = buildFilters({ q: 'MOB-1066' });
    expect(filters.q).toBe('MOB-1066');
  });

  it('from and to are forwarded as strings', () => {
    const filters = buildFilters({ from: '2026-01-01', to: '2026-03-31' });
    expect(filters.from).toBe('2026-01-01');
    expect(filters.to).toBe('2026-03-31');
  });

  it('undefined gate → no gate key in filters', () => {
    const filters = buildFilters({});
    expect(filters.gate).toBeUndefined();
  });

  it('all params together produce correct RunFilters shape', () => {
    const filters = buildFilters({
      q: 'MOB-1066',
      from: '2026-01-01',
      to: '2026-12-31',
      gate: 'pass,warn',
    });
    expect(filters).toEqual({
      q: 'MOB-1066',
      from: '2026-01-01',
      to: '2026-12-31',
      gate: ['pass', 'warn'],
    });
  });
});
