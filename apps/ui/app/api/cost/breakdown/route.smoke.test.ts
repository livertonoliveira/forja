/**
 * Smoke tests for GET /api/cost/breakdown — response shape and graceful degradation (MOB-1074)
 *
 * Calls the route handler directly (no running server required).
 * The DB pool is mocked to return null so getCostBreakdownByProject returns [] —
 * no real DB needed.
 *
 * Scenarios:
 *  1. Default request (no params) → 200 with array
 *  2. With from/to date params → 200 without crashing
 *  3. With limit param → 200 without crashing
 *  4. Invalid from → 400 with error body
 *  5. Invalid to → 400 with error body
 *  6. No DB available → 200 with empty array (graceful degradation)
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/app/api/cost/breakdown/route.smoke.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB to return null — forces getCostBreakdownByProject() to return []
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
  return new Request(`http://localhost/api/cost/breakdown${search}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cost/breakdown smoke — no DB', () => {
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

  it('returns 200 with from and to params without crashing', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?from=2025-01-01&to=2025-01-31'));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });

  it('returns 200 with limit param without crashing', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?limit=10'));

    expect(res.status).toBe(200);
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

  it('returns 400 for invalid limit (zero)', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?limit=0'));

    expect(res.status).toBe(400);
  });
});
