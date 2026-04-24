/**
 * Smoke tests for GET /api/cost/heatmap — response shape and graceful degradation (MOB-1074)
 *
 * Calls the route handler directly (no running server required).
 * The DB pool is mocked to return null so getCostHeatmapByDowHour returns [] —
 * no real DB needed.
 *
 * Scenarios:
 *  1. Default request (no params) → 200 with array
 *  2. With from/to date params → 200 without crashing
 *  3. Invalid from → 400 with error body
 *  4. Invalid to → 400 with error body
 *  5. No DB available → 200 with empty array (graceful degradation)
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/app/api/cost/heatmap/route.smoke.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB to return null — forces getCostHeatmapByDowHour() to return []
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(async () => null),
}));

vi.mock('@/lib/jsonl-reader', () => ({
  listRunIds: vi.fn(async () => []),
  readRunEventsAll: vi.fn(async () => []),
  readRunSummaryEventsAll: vi.fn(async () => []),
  buildRunFromEvents: vi.fn(() => ({})),
}));

vi.mock('@/lib/findings-parser', () => ({
  parseFindings: vi.fn(() => []),
}));

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRequest(search = ''): Request {
  return new Request(`http://localhost/api/cost/heatmap${search}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cost/heatmap smoke — no DB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with an array when no params are given', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });

  it('returns an empty array when DB is unavailable (graceful degradation)', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json).toEqual([]);
  });

  it('returns 200 with from and to date params without crashing', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?from=2025-01-01&to=2025-01-31'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });

  it('returns 400 for invalid from date', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?from=bad-date'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('returns 400 for invalid to date', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?to=bad-date'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty('error');
  });

  it('accepts ISO 8601 datetime strings for from/to', async () => {
    const { GET } = await import('./route');
    const res = await GET(
      makeRequest('?from=2025-01-01T00:00:00Z&to=2025-12-31T23:59:59Z'),
    );

    expect(res.status).toBe(200);
  });
});
