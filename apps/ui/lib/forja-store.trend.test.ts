/**
 * Unit tests for getTrend() and the private helpers (truncateToBucket, stepBucket, fillGaps)
 * in apps/ui/lib/forja-store.ts — Trend Analysis (MOB-1067)
 *
 * Private helpers are tested indirectly through getTrend() by mocking getPool
 * with a fake pg.Pool whose query() method returns controlled rows.
 *
 * Run from monorepo root:
 *   TZ=UTC ./node_modules/.bin/vitest run --pool=forks apps/ui/lib/forja-store.trend.test.ts
 */

// ─── IMPORTANT: Set TZ before any Date constructor fires ─────────────────────
// truncateToBucket and stepBucket use local-time Date methods (setHours, setDate,
// setMonth). To get deterministic ISO keys we pin the process timezone to UTC.
// On Node.js this must happen before the first Date call, which is why this
// assignment sits at the very top of the file, before all imports.
process.env.TZ = 'UTC';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock declarations — must appear before any static import of the module
// ---------------------------------------------------------------------------

// mockQuery is the shared pg Pool.query fake. Each test sets its return value.
const mockQuery = vi.fn();

vi.mock('./db', () => ({
  getPool: vi.fn(),
}));

vi.mock('./jsonl-reader', () => ({
  listRunIds: vi.fn().mockResolvedValue([]),
  readRunSummaryEventsAll: vi.fn().mockResolvedValue([]),
  readRunEventsAll: vi.fn().mockResolvedValue([]),
  buildRunFromEvents: vi.fn(),
}));

vi.mock('./findings-parser', () => ({
  parseFindings: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Static imports — placed after vi.mock so mocks are in place first.
// ---------------------------------------------------------------------------

import { getTrend } from './forja-store';
import { getPool } from './db';

const mockGetPool = vi.mocked(getPool);
const fakePool = { query: mockQuery };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * UTC-midnight ISO string for a given calendar date.
 * With TZ=UTC this is also local midnight, so truncateToBucket(new Date(s), 'day')
 * produces the same ISO key as the DB row bucket value.
 */
function utcDay(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

/**
 * UTC midnight on the 1st of a given month.
 */
function utcMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString();
}

/** Configure getPool mock for the current test. */
function usePool(pool: typeof fakePool | null): void {
  mockGetPool.mockResolvedValue(pool as never);
}

// ---------------------------------------------------------------------------
// getTrend — no DB available
// ---------------------------------------------------------------------------

describe('getTrend — no DB pool', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    usePool(null);
  });

  it('returns an empty array when getPool resolves to null', async () => {
    const result = await getTrend({
      metric: 'findings',
      granularity: 'day',
      from: '2026-01-01',
      to: '2026-01-03',
    });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTrend — findings metric / day granularity
// ---------------------------------------------------------------------------

describe('getTrend — findings metric — day granularity gap-filling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    usePool(fakePool);
  });

  it('returns 3 buckets when DB returns no rows — all gaps have null values', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getTrend({
      metric: 'findings',
      granularity: 'day',
      from: utcDay(2026, 1, 1),
      to: utcDay(2026, 1, 3),
    });

    expect(result).toHaveLength(3);
    const findings = result as Array<{
      bucket: string;
      critical: number | null;
      high: number | null;
      medium: number | null;
      low: number | null;
    }>;
    for (const bucket of findings) {
      expect(bucket.critical).toBeNull();
      expect(bucket.high).toBeNull();
      expect(bucket.medium).toBeNull();
      expect(bucket.low).toBeNull();
    }
  });

  it('fills gaps — Jan 1 and Jan 3 have data; Jan 2 is a gap with all-null values', async () => {
    const jan1 = utcDay(2026, 1, 1);
    const jan3 = utcDay(2026, 1, 3);

    mockQuery.mockResolvedValue({
      rows: [
        { bucket: jan1, severity: 'critical', count: 5 },
        { bucket: jan3, severity: 'high', count: 2 },
      ],
    });

    const result = await getTrend({
      metric: 'findings',
      granularity: 'day',
      from: jan1,
      to: jan3,
    });

    expect(result).toHaveLength(3);

    type FindingRow = { bucket: string; critical: number | null; high: number | null; medium: number | null; low: number | null };
    const [b1, b2, b3] = result as FindingRow[];

    // Jan 1 — critical present
    expect(b1.critical).toBe(5);
    expect(b1.high).toBeNull();

    // Jan 2 — gap — all null
    expect(b2.critical).toBeNull();
    expect(b2.high).toBeNull();
    expect(b2.medium).toBeNull();
    expect(b2.low).toBeNull();

    // Jan 3 — high present
    expect(b3.high).toBe(2);
    expect(b3.critical).toBeNull();
  });

  it('returns no extra gap buckets when all 3 days are covered by DB rows', async () => {
    const jan1 = utcDay(2026, 1, 1);
    const jan2 = utcDay(2026, 1, 2);
    const jan3 = utcDay(2026, 1, 3);

    mockQuery.mockResolvedValue({
      rows: [
        { bucket: jan1, severity: 'low', count: 1 },
        { bucket: jan2, severity: 'medium', count: 3 },
        { bucket: jan3, severity: 'high', count: 2 },
      ],
    });

    const result = await getTrend({
      metric: 'findings',
      granularity: 'day',
      from: jan1,
      to: jan3,
    });

    // fillGaps must not insert extra buckets
    expect(result).toHaveLength(3);
  });

  it('aggregates multiple severity rows for the same bucket into one entry', async () => {
    const jan1 = utcDay(2026, 1, 1);

    mockQuery.mockResolvedValue({
      rows: [
        { bucket: jan1, severity: 'critical', count: 4 },
        { bucket: jan1, severity: 'high', count: 7 },
        { bucket: jan1, severity: 'medium', count: 2 },
        { bucket: jan1, severity: 'low', count: 1 },
      ],
    });

    const result = await getTrend({
      metric: 'findings',
      granularity: 'day',
      from: jan1,
      to: jan1,
    });

    expect(result).toHaveLength(1);
    const [bucket] = result as Array<{
      critical: number | null;
      high: number | null;
      medium: number | null;
      low: number | null;
    }>;
    expect(bucket.critical).toBe(4);
    expect(bucket.high).toBe(7);
    expect(bucket.medium).toBe(2);
    expect(bucket.low).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getTrend — findings metric / month granularity (3-month range)
// ---------------------------------------------------------------------------

describe('getTrend — findings metric — month granularity gap-filling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    usePool(fakePool);
  });

  it('generates 3 buckets for a Jan–Mar range with no DB rows (all gaps)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    // to = Mar 1; stepBucket(Mar 1, 'month') = Apr 1 > Mar 1 → loop stops after 3.
    const result = await getTrend({
      metric: 'findings',
      granularity: 'month',
      from: utcMonth(2026, 1),
      to: utcMonth(2026, 3),
    });

    expect(result).toHaveLength(3);
  });

  it('all 3 month buckets are gaps (null) when DB returns no rows', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getTrend({
      metric: 'findings',
      granularity: 'month',
      from: utcMonth(2026, 1),
      to: utcMonth(2026, 3),
    });

    const typed = result as Array<{ critical: number | null; high: number | null }>;
    for (const b of typed) {
      expect(b.critical).toBeNull();
      expect(b.high).toBeNull();
    }
  });

  it('steps months correctly — bucket timestamps are first of each month at UTC midnight', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getTrend({
      metric: 'findings',
      granularity: 'month',
      from: utcMonth(2026, 1),
      to: utcMonth(2026, 3),
    });

    const buckets = result.map((r) => (r as { bucket: string }).bucket);
    expect(buckets[0]).toBe(utcMonth(2026, 1));
    expect(buckets[1]).toBe(utcMonth(2026, 2));
    expect(buckets[2]).toBe(utcMonth(2026, 3));
  });

  it('only first and third months have data — middle month is a gap', async () => {
    const jan1 = utcMonth(2026, 1);
    const mar1 = utcMonth(2026, 3);

    mockQuery.mockResolvedValue({
      rows: [
        { bucket: jan1, severity: 'critical', count: 10 },
        { bucket: mar1, severity: 'high', count: 3 },
      ],
    });

    const result = await getTrend({
      metric: 'findings',
      granularity: 'month',
      from: jan1,
      to: mar1,
    });

    expect(result).toHaveLength(3);

    type Row = { bucket: string; critical: number | null; high: number | null };
    const [jan, feb, mar] = result as Row[];
    expect(jan.critical).toBe(10);
    expect(feb.critical).toBeNull();
    expect(feb.high).toBeNull();
    expect(mar.high).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// getTrend — gate_fail_rate metric
// ---------------------------------------------------------------------------

describe('getTrend — gate_fail_rate metric', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    usePool(fakePool);
  });

  it('returns GateBuckets with null values when DB returns no rows', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getTrend({
      metric: 'gate_fail_rate',
      granularity: 'day',
      from: utcDay(2026, 1, 1),
      to: utcDay(2026, 1, 2),
    });

    expect(result).toHaveLength(2);
    const buckets = result as Array<{ pass: number | null; warn: number | null; fail: number | null }>;
    for (const b of buckets) {
      expect(b.pass).toBeNull();
      expect(b.warn).toBeNull();
      expect(b.fail).toBeNull();
    }
  });

  it('aggregates pass/warn/fail decisions into a single bucket entry', async () => {
    const jan1 = utcDay(2026, 1, 1);

    mockQuery.mockResolvedValue({
      rows: [
        { bucket: jan1, decision: 'pass', count: 8 },
        { bucket: jan1, decision: 'warn', count: 2 },
        { bucket: jan1, decision: 'fail', count: 1 },
      ],
    });

    const result = await getTrend({
      metric: 'gate_fail_rate',
      granularity: 'day',
      from: jan1,
      to: jan1,
    });

    expect(result).toHaveLength(1);
    const [bucket] = result as Array<{ pass: number | null; warn: number | null; fail: number | null }>;
    expect(bucket.pass).toBe(8);
    expect(bucket.warn).toBe(2);
    expect(bucket.fail).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getTrend — cost metric
// ---------------------------------------------------------------------------

describe('getTrend — cost metric', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    usePool(fakePool);
  });

  it('returns CostBuckets with null totalCost when DB returns no rows', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getTrend({
      metric: 'cost',
      granularity: 'day',
      from: utcDay(2026, 1, 1),
      to: utcDay(2026, 1, 2),
    });

    expect(result).toHaveLength(2);
    const buckets = result as Array<{ totalCost: string | null }>;
    for (const b of buckets) {
      expect(b.totalCost).toBeNull();
    }
  });

  it('maps total_cost from DB row to totalCost field', async () => {
    const jan1 = utcDay(2026, 1, 1);

    mockQuery.mockResolvedValue({
      rows: [{ bucket: jan1, total_cost: '12.50' }],
    });

    const result = await getTrend({
      metric: 'cost',
      granularity: 'day',
      from: jan1,
      to: jan1,
    });

    expect(result).toHaveLength(1);
    const [bucket] = result as Array<{ totalCost: string | null }>;
    expect(bucket.totalCost).toBe('12.50');
  });
});

// ---------------------------------------------------------------------------
// getTrend — run_duration metric
// ---------------------------------------------------------------------------

describe('getTrend — run_duration metric', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    usePool(fakePool);
  });

  it('returns DurationBuckets with null avgDurationMs when DB returns no rows', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await getTrend({
      metric: 'run_duration',
      granularity: 'day',
      from: utcDay(2026, 1, 1),
      to: utcDay(2026, 1, 2),
    });

    expect(result).toHaveLength(2);
    const buckets = result as Array<{ avgDurationMs: number | null }>;
    for (const b of buckets) {
      expect(b.avgDurationMs).toBeNull();
    }
  });

  it('maps avg_duration_ms from DB row to avgDurationMs field', async () => {
    const jan1 = utcDay(2026, 1, 1);

    mockQuery.mockResolvedValue({
      rows: [{ bucket: jan1, avg_duration_ms: 45000 }],
    });

    const result = await getTrend({
      metric: 'run_duration',
      granularity: 'day',
      from: jan1,
      to: jan1,
    });

    expect(result).toHaveLength(1);
    const [bucket] = result as Array<{ avgDurationMs: number | null }>;
    expect(bucket.avgDurationMs).toBe(45000);
  });
});

// ---------------------------------------------------------------------------
// getTrend — DB query failure path
//
// NOTE: getTrend's try/catch wraps synchronous code; the query promise is
// returned (not awaited) from the switch statement, so a DB rejection is
// NOT caught by the try/catch and propagates to the caller. This is the
// current observable behaviour of the implementation.
// ---------------------------------------------------------------------------

describe('getTrend — DB query throws', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    usePool(fakePool);
  });

  it('propagates the rejection when the DB query throws', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));

    await expect(
      getTrend({
        metric: 'findings',
        granularity: 'day',
        from: utcDay(2026, 1, 1),
        to: utcDay(2026, 1, 3),
      }),
    ).rejects.toThrow('connection refused');
  });
});
