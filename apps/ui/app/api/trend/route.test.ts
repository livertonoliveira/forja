/**
 * Integration tests for GET /api/trend (MOB-1067)
 *
 * Test cases:
 *  1. Missing `metric` param → 400 { error: 'invalid metric' }
 *  2. Invalid `metric` param → 400 { error: 'invalid metric' }
 *  3. Valid metric=findings → 200 with mocked TrendBucket array
 *  4. Valid metric=cost&granularity=week → getTrend called with correct granularity
 *  5. getTrend throws → 500 with error message
 *
 * Run:
 *   node_modules/.bin/vitest run --pool=forks apps/ui/app/api/trend/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any import of the SUT
// ---------------------------------------------------------------------------

// Provide a minimal NextResponse.json implementation so the route can run
// outside a real Next.js runtime.
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      _json: data,
      _status: init?.status ?? 200,
    })),
  },
}));

// Mock getTrend from forja-store — default resolves to empty array; tests
// override per-case with mockResolvedValueOnce / mockRejectedValueOnce.
const mockGetTrend = vi.fn();

vi.mock('@/lib/forja-store', () => ({
  getTrend: (...args: unknown[]) => mockGetTrend(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callRoute(url: string) {
  const { GET } = await import('@/app/api/trend/route');
  return GET(new Request(url));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/trend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTrend.mockResolvedValue([]);
  });

  // ── 1. Missing metric param ────────────────────────────────────────────────

  it('returns 400 with { error: "invalid metric" } when metric is absent', async () => {
    const res = await callRoute('http://localhost/api/trend');

    // @ts-expect-error — we're using the lightweight mock shape, not NextResponse
    expect(res._status).toBe(400);
    // @ts-expect-error
    expect(res._json).toEqual({ error: 'invalid metric' });
    expect(mockGetTrend).not.toHaveBeenCalled();
  });

  // ── 2. Invalid metric param ────────────────────────────────────────────────

  it('returns 400 with { error: "invalid metric" } for an unrecognised metric', async () => {
    const res = await callRoute('http://localhost/api/trend?metric=invalid');

    // @ts-expect-error
    expect(res._status).toBe(400);
    // @ts-expect-error
    expect(res._json).toEqual({ error: 'invalid metric' });
    expect(mockGetTrend).not.toHaveBeenCalled();
  });

  // ── 3. Valid metric=findings — returns 200 with mocked buckets ─────────────

  it('returns 200 with the buckets from getTrend when metric=findings', async () => {
    const buckets = [
      { bucket: '2026-04-01T00:00:00.000Z', critical: 2, high: 1, medium: 0, low: 3 },
      { bucket: '2026-04-02T00:00:00.000Z', critical: 0, high: 0, medium: 1, low: 0 },
    ];
    mockGetTrend.mockResolvedValueOnce(buckets);

    const res = await callRoute('http://localhost/api/trend?metric=findings');

    // @ts-expect-error
    expect(res._status).toBe(200);
    // @ts-expect-error
    expect(res._json).toEqual(buckets);
    expect(mockGetTrend).toHaveBeenCalledOnce();
  });

  // ── 4. metric=cost&granularity=week — correct args forwarded ──────────────

  it('forwards granularity=week to getTrend when metric=cost&granularity=week', async () => {
    const res = await callRoute(
      'http://localhost/api/trend?metric=cost&granularity=week',
    );

    // @ts-expect-error
    expect(res._status).toBe(200);
    expect(mockGetTrend).toHaveBeenCalledOnce();

    const callArg = mockGetTrend.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.metric).toBe('cost');
    expect(callArg.granularity).toBe('week');
  });

  // ── 5. getTrend throws → 500 ───────────────────────────────────────────────

  it('returns 500 with the error message when getTrend throws', async () => {
    mockGetTrend.mockRejectedValueOnce(new Error('DB unavailable'));

    const res = await callRoute('http://localhost/api/trend?metric=run_duration');

    // @ts-expect-error
    expect(res._status).toBe(500);
    // @ts-expect-error
    expect(res._json).toEqual({ error: 'internal error' });
  });
});
