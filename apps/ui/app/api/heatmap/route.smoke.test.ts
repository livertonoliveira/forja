/**
 * Smoke tests for GET /api/heatmap — response shape and graceful degradation (MOB-1069)
 *
 * Calls the route handler directly (no running server required).
 * The DB pool is mocked to return null so the route returns the empty fallback
 * { cells: [], max: 0 } — no real DB needed.
 *
 * Scenarios:
 *  1. Default request (no params) → 200 with { cells, max }
 *  2. metric=runs → 200 with valid structure
 *  3. metric=critical_findings → 200 without crashing
 *  4. metric=cost → 200 without crashing
 *  5. project filter → 200 without crashing
 *  6. No DB available → 200 with empty cells array (graceful degradation)
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=forks apps/ui/app/api/heatmap/route.smoke.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB to return null — forces the route to return the empty fallback
// without a real DB connection.
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(async () => null),
}));

// ---------------------------------------------------------------------------
// Helper — build a Request URL the same way the Next.js runtime would
// ---------------------------------------------------------------------------

function makeRequest(search: string): Request {
  return new Request(`http://localhost/api/heatmap${search}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/heatmap smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responds with valid structure when no DB', async () => {
    const { GET } = await import('./route');
    const req = new Request('http://localhost/api/heatmap');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('cells');
    expect(json).toHaveProperty('max');
    expect(Array.isArray(json.cells)).toBe(true);
    expect(typeof json.max).toBe('number');
  });

  it('accepts all metric values without crashing', async () => {
    const { GET } = await import('./route');
    for (const metric of ['runs', 'critical_findings', 'cost']) {
      const req = new Request(`http://localhost/api/heatmap?metric=${metric}`);
      const res = await GET(req);
      expect(res.status).toBe(200);
    }
  });
});

describe('GET /api/heatmap — optional params', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('project filter is accepted → 200 with valid structure', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=runs&project=MOB'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('cells');
    expect(body).toHaveProperty('max');
    expect(Array.isArray(body.cells)).toBe(true);
  });

  it('metric=critical_findings with project filter → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=critical_findings&project=MOB'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('cells');
    expect(body).toHaveProperty('max');
  });

  it('metric=cost with project filter → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=cost&project=MOB'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('cells');
    expect(body).toHaveProperty('max');
  });
});

describe('GET /api/heatmap — graceful degradation without DB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with empty cells and max=0 when no DB pool is available', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(200);
    const body = await res.json();
    // With no DB, the route returns the empty fallback immediately
    expect(body.cells).toHaveLength(0);
    expect(body.max).toBe(0);
  });
});
