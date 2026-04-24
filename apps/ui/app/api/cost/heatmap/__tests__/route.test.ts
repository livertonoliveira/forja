/**
 * Integration tests for GET /api/cost/heatmap (MOB-1074)
 *
 * Tests route handler in isolation: query param validation, store delegation,
 * successful responses, and error handling. The store function is mocked so no
 * real DB connection is needed.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/app/api/cost/heatmap/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/server so the route runs outside the Next.js runtime
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  },
}));

// ---------------------------------------------------------------------------
// Mock the store so no DB is required
// ---------------------------------------------------------------------------

const mockGetCostHeatmapByDowHour = vi.fn();

vi.mock('@/lib/forja-store', () => ({
  getCostHeatmapByDowHour: (...args: unknown[]) =>
    mockGetCostHeatmapByDowHour(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(search = ''): Request {
  return new Request(`http://localhost/api/cost/heatmap${search}`);
}

async function callRoute(search = '') {
  const { GET } = await import('../route');
  const res = await GET(makeRequest(search));
  const json = await res.json();
  return { status: res.status, json };
}

const SAMPLE_CELLS = [
  { dow: 1, hour: 9, avgCost: 0.05, count: 10 },
  { dow: 3, hour: 14, avgCost: 0.12, count: 25 },
  { dow: 5, hour: 22, avgCost: 0.03, count: 5 },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cost/heatmap — successful responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCostHeatmapByDowHour.mockResolvedValue(SAMPLE_CELLS);
  });

  it('returns 200 with heatmap array on default request (no params)', async () => {
    const { status, json } = await callRoute();

    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(3);
  });

  it('returns correct cell shape (dow, hour, avgCost, count)', async () => {
    const { json } = await callRoute();

    const cell = json[0];
    expect(cell).toHaveProperty('dow');
    expect(cell).toHaveProperty('hour');
    expect(cell).toHaveProperty('avgCost');
    expect(cell).toHaveProperty('count');
  });

  it('dow values are within valid range [0–6]', async () => {
    const { json } = await callRoute();

    json.forEach((cell: { dow: number }) => {
      expect(cell.dow).toBeGreaterThanOrEqual(0);
      expect(cell.dow).toBeLessThanOrEqual(6);
    });
  });

  it('hour values are within valid range [0–23]', async () => {
    const { json } = await callRoute();

    json.forEach((cell: { hour: number }) => {
      expect(cell.hour).toBeGreaterThanOrEqual(0);
      expect(cell.hour).toBeLessThanOrEqual(23);
    });
  });

  it('returns 200 with empty array when store returns []', async () => {
    mockGetCostHeatmapByDowHour.mockResolvedValue([]);

    const { status, json } = await callRoute();

    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('passes from query param to the store', async () => {
    const { status } = await callRoute('?from=2025-01-01');

    expect(status).toBe(200);
    expect(mockGetCostHeatmapByDowHour).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2025-01-01' }),
    );
  });

  it('passes to query param to the store', async () => {
    const { status } = await callRoute('?to=2025-01-31');

    expect(status).toBe(200);
    expect(mockGetCostHeatmapByDowHour).toHaveBeenCalledWith(
      expect.objectContaining({ to: '2025-01-31' }),
    );
  });

  it('passes both from and to to the store', async () => {
    await callRoute('?from=2025-02-01&to=2025-02-28');

    expect(mockGetCostHeatmapByDowHour).toHaveBeenCalledWith({
      from: '2025-02-01',
      to: '2025-02-28',
    });
  });
});

describe('GET /api/cost/heatmap — query param validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCostHeatmapByDowHour.mockResolvedValue([]);
  });

  it('returns 400 with error message when from is not a valid date', async () => {
    const { status, json } = await callRoute('?from=not-a-date');

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/invalid from date/i);
  });

  it('returns 400 with error message when to is not a valid date', async () => {
    const { status, json } = await callRoute('?to=not-a-date');

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/invalid to date/i);
  });

  it('accepts valid ISO date strings for from and to without error', async () => {
    const { status } = await callRoute(
      '?from=2025-01-01T00:00:00Z&to=2025-12-31T23:59:59Z',
    );

    expect(status).toBe(200);
  });

  it('accepts YYYY-MM-DD date format for from', async () => {
    const { status } = await callRoute('?from=2025-06-15');

    expect(status).toBe(200);
  });

  it('accepts YYYY-MM-DD date format for to', async () => {
    const { status } = await callRoute('?to=2025-06-30');

    expect(status).toBe(200);
  });

  it('does not accept limit param (heatmap route ignores it — no 400)', async () => {
    // The heatmap route does not validate limit — it simply ignores it
    const { status } = await callRoute('?limit=abc');

    // Route should still return 200 (limit is not a param for this route)
    expect(status).toBe(200);
  });
});

describe('GET /api/cost/heatmap — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 when the store throws an unexpected error', async () => {
    mockGetCostHeatmapByDowHour.mockRejectedValue(new Error('unexpected crash'));

    const { status, json } = await callRoute();

    expect(status).toBe(500);
    expect(json).toHaveProperty('error');
  });
});
