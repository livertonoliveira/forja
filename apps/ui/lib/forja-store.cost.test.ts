/**
 * Unit tests for getCostBreakdownByProject() and getCostHeatmapByDowHour()
 * in apps/ui/lib/forja-store.ts (MOB-1074)
 *
 * Tests mapping logic, defaults, and error handling via a mocked DB pool.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/lib/forja-store.cost.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import of the module under test
// ---------------------------------------------------------------------------

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
// Static imports — placed after vi.mock calls
// ---------------------------------------------------------------------------

import { getCostBreakdownByProject, getCostHeatmapByDowHour } from './forja-store';
import { getPool } from './db';

const mockGetPool = vi.mocked(getPool);
const fakePool = { query: mockQuery };

// ---------------------------------------------------------------------------
// getCostBreakdownByProject
// ---------------------------------------------------------------------------

describe('getCostBreakdownByProject — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(fakePool as never);
  });

  it('maps a single DB row to BreakdownRow correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ project: 'MOB', total_cost: '1.5', run_count: '10' }],
    });

    const result = await getCostBreakdownByProject();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      project: 'MOB',
      totalCost: 1.5,
      inputCost: 0,
      outputCost: 0,
      cacheCost: 0,
      runCount: 10,
    });
  });

  it('maps multiple rows and preserves order', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { project: 'MOB', total_cost: '5.0', run_count: '20' },
        { project: 'WEB', total_cost: '2.5', run_count: '8' },
        { project: 'API', total_cost: '0.1', run_count: '2' },
      ],
    });

    const result = await getCostBreakdownByProject();

    expect(result).toHaveLength(3);
    expect(result[0].project).toBe('MOB');
    expect(result[1].project).toBe('WEB');
    expect(result[2].project).toBe('API');
  });

  it('coerces string total_cost to float', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ project: 'X', total_cost: '3.14159', run_count: '1' }],
    });

    const result = await getCostBreakdownByProject();

    expect(result[0].totalCost).toBeCloseTo(3.14159);
  });

  it('coerces string run_count to integer', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ project: 'X', total_cost: '1.0', run_count: '42' }],
    });

    const result = await getCostBreakdownByProject();

    expect(result[0].runCount).toBe(42);
  });

  it('passes from, to, and limit to the DB query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getCostBreakdownByProject({
      from: '2025-01-01T00:00:00Z',
      to: '2025-01-31T23:59:59Z',
      limit: 5,
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('2025-01-01T00:00:00Z');
    expect(params[1]).toBe('2025-01-31T23:59:59Z');
    expect(params[2]).toBe(5);
  });

  it('defaults limit to 50 when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getCostBreakdownByProject();

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(50);
  });
});

describe('getCostBreakdownByProject — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(fakePool as never);
  });

  it('returns empty array when DB returns no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getCostBreakdownByProject();

    expect(result).toEqual([]);
  });

  it('falls back to 0 when total_cost is an invalid string', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ project: 'X', total_cost: 'NaN', run_count: '1' }],
    });

    const result = await getCostBreakdownByProject();

    expect(result[0].totalCost).toBe(0);
  });

  it('falls back to 0 when run_count is an invalid string', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ project: 'X', total_cost: '1.0', run_count: 'bad' }],
    });

    const result = await getCostBreakdownByProject();

    expect(result[0].runCount).toBe(0);
  });

  it('always sets inputCost, outputCost, cacheCost to 0', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ project: 'X', total_cost: '1.0', run_count: '1' }],
    });

    const result = await getCostBreakdownByProject();

    expect(result[0].inputCost).toBe(0);
    expect(result[0].outputCost).toBe(0);
    expect(result[0].cacheCost).toBe(0);
  });
});

describe('getCostBreakdownByProject — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] when getPool returns null (no DB configured)', async () => {
    mockGetPool.mockResolvedValue(null);

    const result = await getCostBreakdownByProject();

    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns [] when DB query throws', async () => {
    mockGetPool.mockResolvedValue(fakePool as never);
    mockQuery.mockRejectedValueOnce(new Error('connection reset'));

    const result = await getCostBreakdownByProject();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getCostHeatmapByDowHour
// ---------------------------------------------------------------------------

describe('getCostHeatmapByDowHour — happy path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(fakePool as never);
  });

  it('maps a single DB row to HeatmapCell correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ dow: '3', hour: '14', avg_cost: '0.025', count: '7' }],
    });

    const result = await getCostHeatmapByDowHour();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      dow: 3,
      hour: 14,
      avgCost: 0.025,
      count: 7,
    });
  });

  it('maps multiple rows spanning the full 7×24 grid range', async () => {
    const rows = [
      { dow: '0', hour: '0', avg_cost: '0.001', count: '1' },
      { dow: '6', hour: '23', avg_cost: '0.999', count: '99' },
    ];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await getCostHeatmapByDowHour();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ dow: 0, hour: 0, avgCost: 0.001, count: 1 });
    expect(result[1]).toEqual({ dow: 6, hour: 23, avgCost: 0.999, count: 99 });
  });

  it('coerces string dow and hour to integers', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ dow: '5', hour: '9', avg_cost: '0.1', count: '3' }],
    });

    const result = await getCostHeatmapByDowHour();

    expect(typeof result[0].dow).toBe('number');
    expect(typeof result[0].hour).toBe('number');
    expect(result[0].dow).toBe(5);
    expect(result[0].hour).toBe(9);
  });

  it('coerces string avg_cost to float', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ dow: '1', hour: '12', avg_cost: '0.123456789', count: '1' }],
    });

    const result = await getCostHeatmapByDowHour();

    expect(result[0].avgCost).toBeCloseTo(0.123456789);
  });

  it('passes from and to to the DB query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getCostHeatmapByDowHour({
      from: '2025-03-01T00:00:00Z',
      to: '2025-03-31T23:59:59Z',
    });

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe('2025-03-01T00:00:00Z');
    expect(params[1]).toBe('2025-03-31T23:59:59Z');
  });

  it('does NOT pass limit to the DB query (heatmap has no limit param)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getCostHeatmapByDowHour();

    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Only 2 params: $1 = from, $2 = to
    expect(params).toHaveLength(2);
  });
});

describe('getCostHeatmapByDowHour — edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(fakePool as never);
  });

  it('returns empty array when DB returns no rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getCostHeatmapByDowHour();

    expect(result).toEqual([]);
  });

  it('falls back to 0 when avg_cost is invalid', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ dow: '1', hour: '0', avg_cost: 'NaN', count: '1' }],
    });

    const result = await getCostHeatmapByDowHour();

    expect(result[0].avgCost).toBe(0);
  });

  it('falls back to 0 when count is invalid', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ dow: '2', hour: '5', avg_cost: '0.5', count: 'bad' }],
    });

    const result = await getCostHeatmapByDowHour();

    expect(result[0].count).toBe(0);
  });
});

describe('getCostHeatmapByDowHour — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] when getPool returns null (no DB configured)', async () => {
    mockGetPool.mockResolvedValue(null);

    const result = await getCostHeatmapByDowHour();

    expect(result).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns [] when DB query throws', async () => {
    mockGetPool.mockResolvedValue(fakePool as never);
    mockQuery.mockRejectedValueOnce(new Error('query timeout'));

    const result = await getCostHeatmapByDowHour();

    expect(result).toEqual([]);
  });
});
