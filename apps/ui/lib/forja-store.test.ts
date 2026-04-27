/**
 * Unit tests for apps/ui/lib/forja-store.ts — listRuns with JSONL fallback (MOB-1066)
 *
 * Tests the listRunsFromJsonlFiltered logic by mocking jsonl-reader and db.
 * Validates: q filter, gate filter, from/to date range, and empty filters.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/lib/forja-store.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

// Force DB to return null so listRuns falls back to JSONL path
vi.mock('./db', () => ({
  getPool: vi.fn().mockResolvedValue(null),
}));

// We'll control what jsonl-reader returns via these mocks
const mockListRunIds = vi.fn();
const mockReadRunSummaryEventsAll = vi.fn();
const mockBuildRunFromEvents = vi.fn();

vi.mock('./jsonl-reader', () => ({
  listRunIds: (...args: unknown[]) => mockListRunIds(...args),
  readRunSummaryEventsAll: (...args: unknown[]) => mockReadRunSummaryEventsAll(...args),
  buildRunFromEvents: (...args: unknown[]) => mockBuildRunFromEvents(...args),
  // listRunEventsAll and readRunEventsAll are not needed for listRuns
  readRunEventsAll: vi.fn().mockResolvedValue([]),
}));

vi.mock('./findings-parser', () => ({
  parseFindings: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal run object that buildRunFromEvents would return.
 * We use this to configure the mock for each test scenario.
 */
function makeRunEvent(overrides: {
  id?: string;
  issueId?: string;
  status?: string;
  startedAt?: string;
  finishedAt?: string | null;
  totalCostUsd?: string;
  gateFinal?: string | null;
}) {
  return {
    id: overrides.id ?? 'run-1',
    issueId: overrides.issueId ?? 'MOB-001',
    status: overrides.status ?? 'done',
    startedAt: overrides.startedAt ?? '2025-04-01T10:00:00Z',
    finishedAt: overrides.finishedAt ?? '2025-04-01T10:30:00Z',
    totalCostUsd: overrides.totalCostUsd ?? '0.05',
    gateFinal: overrides.gateFinal ?? null,
  };
}

/** Configures mocks to return a given list of run fixtures */
function setupJsonlMocks(runs: ReturnType<typeof makeRunEvent>[]) {
  const ids = runs.map((r) => r.id);
  mockListRunIds.mockResolvedValue(ids);
  // readRunSummaryEventsAll returns an array of event arrays (one per run)
  mockReadRunSummaryEventsAll.mockResolvedValue(ids.map(() => []));
  // buildRunFromEvents returns a run object based on the runId provided
  mockBuildRunFromEvents.mockImplementation((runId: string) => {
    const run = runs.find((r) => r.id === runId);
    if (!run) throw new Error(`Unknown runId: ${runId}`);
    return run;
  });
}

// ---------------------------------------------------------------------------
// Test data fixtures
// ---------------------------------------------------------------------------

const RUNS_FIXTURE: ReturnType<typeof makeRunEvent>[] = [
  makeRunEvent({ id: 'run-1', issueId: 'MOB-001', status: 'done', startedAt: '2025-04-01T10:00:00Z', gateFinal: 'pass' }),
  makeRunEvent({ id: 'run-2', issueId: 'MOB-002', status: 'failed', startedAt: '2025-04-10T12:00:00Z', gateFinal: 'fail' }),
  makeRunEvent({ id: 'run-3', issueId: 'MOB-003', status: 'done', startedAt: '2025-04-15T08:00:00Z', gateFinal: 'warn' }),
  makeRunEvent({ id: 'run-4', issueId: 'MOB-004', status: 'dev', startedAt: '2025-04-20T16:00:00Z', gateFinal: null }),
  makeRunEvent({ id: 'run-5', issueId: 'MOB-SPECIAL', status: 'done', startedAt: '2025-04-23T09:00:00Z', gateFinal: 'pass' }),
];

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('listRuns (JSONL fallback) — empty filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupJsonlMocks(RUNS_FIXTURE);
  });

  it('returns all runs when no filters are applied', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({});
    expect(result).toHaveLength(RUNS_FIXTURE.length);
  });

  it('returns runs sorted by startedAt descending (most recent first)', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({});
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].startedAt >= result[i].startedAt).toBe(true);
    }
  });

  it('maps issueId correctly from the JSONL data', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({});
    const ids = result.map((r) => r.issueId);
    expect(ids).toContain('MOB-001');
    expect(ids).toContain('MOB-SPECIAL');
  });

  it('maps gate correctly from the JSONL data', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({});
    const run1 = result.find((r) => r.id === 'run-1');
    expect(run1?.gate).toBe('pass');
  });
});

describe('listRuns (JSONL fallback) — q filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupJsonlMocks(RUNS_FIXTURE);
  });

  it('filters by issueId (case-insensitive)', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ q: 'mob-001' });
    expect(result).toHaveLength(1);
    expect(result[0].issueId).toBe('MOB-001');
  });

  it('filters by issueId with uppercase query', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ q: 'MOB-002' });
    expect(result).toHaveLength(1);
    expect(result[0].issueId).toBe('MOB-002');
  });

  it('filters by status (case-insensitive)', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ q: 'FAILED' });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('failed');
  });

  it('returns multiple matches when query is a partial prefix (e.g. "MOB")', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ q: 'MOB' });
    expect(result.length).toBe(RUNS_FIXTURE.length);
  });

  it('returns empty array when query matches nothing', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ q: 'NONEXISTENT-XYZ' });
    expect(result).toHaveLength(0);
  });

  it('matches partial issueId (SPECIAL matches MOB-SPECIAL)', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ q: 'SPECIAL' });
    expect(result).toHaveLength(1);
    expect(result[0].issueId).toBe('MOB-SPECIAL');
  });
});

describe('listRuns (JSONL fallback) — gate filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupJsonlMocks(RUNS_FIXTURE);
  });

  it('filters to only "pass" gate runs', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ gate: ['pass'] });
    expect(result.every((r) => r.gate === 'pass')).toBe(true);
    expect(result).toHaveLength(2); // run-1 and run-5
  });

  it('filters to only "fail" gate runs', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ gate: ['fail'] });
    expect(result).toHaveLength(1);
    expect(result[0].gate).toBe('fail');
  });

  it('filters to only "warn" gate runs', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ gate: ['warn'] });
    expect(result).toHaveLength(1);
    expect(result[0].gate).toBe('warn');
  });

  it('returns runs matching "pass" OR "warn" when both specified', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ gate: ['pass', 'warn'] });
    expect(result).toHaveLength(3); // run-1, run-3, run-5
    expect(result.every((r) => r.gate === 'pass' || r.gate === 'warn')).toBe(true);
  });

  it('excludes runs with null gate when gate filter is applied', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ gate: ['pass'] });
    expect(result.some((r) => r.gate === null)).toBe(false);
  });

  it('returns all runs when gate array is empty (no gate filter)', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ gate: [] });
    expect(result).toHaveLength(RUNS_FIXTURE.length);
  });
});

describe('listRuns (JSONL fallback) — from/to date range filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupJsonlMocks(RUNS_FIXTURE);
  });

  it('filters to runs on or after "from" date', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ from: '2025-04-15' });
    // Runs with startedAt >= '2025-04-15' are run-3, run-4, run-5
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.startedAt >= '2025-04-15')).toBe(true);
  });

  it('filters to runs on or before "to" date', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ to: '2025-04-10' });
    // Runs with startedAt <= '2025-04-10T23:59:59' are run-1, run-2
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.startedAt <= '2025-04-10T23:59:59')).toBe(true);
  });

  it('filters to a specific date range from+to', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ from: '2025-04-10', to: '2025-04-15' });
    // run-2 (Apr 10) and run-3 (Apr 15) are within range
    expect(result).toHaveLength(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain('run-2');
    expect(ids).toContain('run-3');
  });

  it('returns empty array when date range has no matching runs', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ from: '2025-05-01', to: '2025-05-31' });
    expect(result).toHaveLength(0);
  });

  it('returns all runs when no date filter is applied', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({});
    expect(result).toHaveLength(RUNS_FIXTURE.length);
  });
});

describe('listRuns (JSONL fallback) — combined filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupJsonlMocks(RUNS_FIXTURE);
  });

  it('q + gate together narrow results correctly', async () => {
    const { listRuns } = await import('./forja-store');
    // MOB-005 doesn't exist but "done" matches run-1, run-3, run-5; gate=pass narrows to run-1, run-5
    const result = await listRuns({ q: 'done', gate: ['pass'] });
    expect(result.every((r) => r.status === 'done' && r.gate === 'pass')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('from + gate together narrow results correctly', async () => {
    const { listRuns } = await import('./forja-store');
    // from=2025-04-15 => run-3, run-4, run-5; gate=pass => run-5 only
    const result = await listRuns({ from: '2025-04-15', gate: ['pass'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('run-5');
  });
});

describe('listRuns (JSONL fallback) — empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListRunIds.mockResolvedValue([]);
    mockReadRunSummaryEventsAll.mockResolvedValue([]);
  });

  it('returns empty array when there are no runs at all', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({});
    expect(result).toEqual([]);
  });

  it('returns empty array with filters when there are no runs', async () => {
    const { listRuns } = await import('./forja-store');
    const result = await listRuns({ q: 'test', gate: ['pass'] });
    expect(result).toEqual([]);
  });
});
