/**
 * Integration tests for GET /api/heatmap (MOB-1069)
 *
 * Test cases:
 *  1. Returns empty response when DB is unavailable (no pool)
 *  2. Returns empty response on DB error
 *  3. metric=runs (default) returns cells correctly
 *  4. metric=runs with project filter passes ILIKE param
 *  5. metric=critical_findings without project
 *  6. metric=cost returns float value
 *  7. Date normalization: handles Date object from pg driver
 *
 * Run:
 *   cd apps/ui && npx vitest run app/api/heatmap/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any import of the SUT
// ---------------------------------------------------------------------------

// Minimal NextResponse.json shim so the route can run outside a real Next.js
// runtime. We return a real Response so res.json() works naturally.
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => {
      return new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  },
}));

// Mock getPool — tests override the resolved value per-case.
const mockGetPool = vi.fn();

vi.mock('@/lib/db', () => ({
  getPool: (...args: unknown[]) => mockGetPool(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(search = ''): Request {
  return new Request(`http://localhost/api/heatmap${search}`);
}

async function callRoute(search = '') {
  const { GET } = await import('./route');
  const res = await GET(makeRequest(search));
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/heatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. No pool available ───────────────────────────────────────────────────

  it('returns { cells: [], max: 0 } with status 200 when getPool returns null', async () => {
    mockGetPool.mockResolvedValue(null);

    const { status, json } = await callRoute();

    expect(status).toBe(200);
    expect(json).toEqual({ cells: [], max: 0 });
  });

  // ── 2. DB throws on query ──────────────────────────────────────────────────

  it('returns { cells: [], max: 0 } with status 200 when the DB query throws', async () => {
    mockGetPool.mockResolvedValue({
      query: vi.fn().mockRejectedValue(new Error('connection reset')),
    });

    const { status, json } = await callRoute();

    expect(status).toBe(200);
    expect(json).toEqual({ cells: [], max: 0 });
  });

  // ── 3. metric=runs (default) returns cells correctly ──────────────────────

  it('returns correct cells and max for metric=runs with a single DB row', async () => {
    mockGetPool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ date: '2025-01-15', hour: 10, value: 5 }],
      }),
    });

    const { status, json } = await callRoute('?metric=runs');

    expect(status).toBe(200);
    expect(json.cells).toHaveLength(1);
    expect(json.cells[0]).toEqual({ date: '2025-01-15', hour: 10, value: 5 });
    expect(json.max).toBe(5);
  });

  // ── 4. metric=runs with project filter passes ILIKE param ─────────────────

  it('passes %MOB% as query param when project=MOB is provided', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockGetPool.mockResolvedValue({ query: mockQuery });

    await callRoute('?metric=runs&project=MOB');

    expect(mockQuery).toHaveBeenCalledOnce();
    const [, queryParams] = mockQuery.mock.calls[0] as [string, string[]];
    expect(queryParams).toContain('%MOB%');
  });

  // ── 5. metric=critical_findings without project ────────────────────────────

  it('returns correct cells for metric=critical_findings without project filter', async () => {
    mockGetPool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ date: '2025-03-10', hour: 14, value: 3 }],
      }),
    });

    const { status, json } = await callRoute('?metric=critical_findings');

    expect(status).toBe(200);
    expect(json.cells).toHaveLength(1);
    expect(json.cells[0]).toEqual({ date: '2025-03-10', hour: 14, value: 3 });
    expect(json.max).toBe(3);
  });

  // ── 6. metric=cost returns float value ────────────────────────────────────

  it('returns a float value for metric=cost', async () => {
    mockGetPool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ date: '2025-01-15', hour: 8, value: 0.025 }],
      }),
    });

    const { status, json } = await callRoute('?metric=cost');

    expect(status).toBe(200);
    expect(json.cells).toHaveLength(1);
    expect(typeof json.cells[0].value).toBe('number');
    expect(json.cells[0].value).toBeCloseTo(0.025);
    expect(json.max).toBeCloseTo(0.025);
  });

  // ── 7. Date normalization: Date object from pg driver ─────────────────────

  it('normalises a Date object from the pg driver to a YYYY-MM-DD string', async () => {
    mockGetPool.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        rows: [{ date: new Date('2025-01-15T00:00:00Z'), hour: 10, value: 3 }],
      }),
    });

    const { status, json } = await callRoute('?metric=runs');

    expect(status).toBe(200);
    expect(json.cells).toHaveLength(1);
    expect(json.cells[0].date).toBe('2025-01-15');
    expect(json.cells[0].hour).toBe(10);
    expect(json.cells[0].value).toBe(3);
  });
});
