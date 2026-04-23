/**
 * Smoke tests for GET /api/trend — parameter validation and response shape (MOB-1067)
 *
 * Calls the route handler directly (no running server required).
 * The DB pool is mocked to return null so getTrend returns [] — no real DB needed.
 *
 * Scenarios:
 *  1. Missing metric → 400
 *  2. Invalid metric value → 400
 *  3. Invalid granularity value → 200, falls back to "day" (no error)
 *  4. GET /api/trend?metric=findings → 200, array (may be empty without DB)
 *  5. GET /api/trend?metric=gate_fail_rate → 200, array
 *  6. GET /api/trend?metric=run_duration → 200, array
 *  7. GET /api/trend?metric=cost&granularity=week → 200, array
 *  8. GET /api/trend?metric=findings&project=MOB → 200, array
 *  9. GET /api/trend?metric=findings&from=2025-01-01&to=2025-01-31 → 200, array
 * 10. No DB available → 200 with empty array (graceful degradation)
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=forks apps/ui/app/api/trend/route.smoke.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock DB to return null — forces getTrend() to return [] without a real DB
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(async () => null),
}));

// forja-store and jsonl-reader mocks are needed only if getPool returns null path
// getTrend with no DB returns [] immediately — no jsonl-reader calls are made
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
// Helper — build a Request URL the same way the Next.js runtime would
// ---------------------------------------------------------------------------

function makeRequest(search: string): Request {
  return new Request(`http://localhost/api/trend${search}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/trend — parameter validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when metric param is missing', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when metric param is an invalid value', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=invalid_metric'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when metric param is empty string', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric='));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/trend — valid metric values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('metric=findings → 200 with an array body', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=findings'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('metric=gate_fail_rate → 200 with an array body', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=gate_fail_rate'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('metric=run_duration → 200 with an array body', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=run_duration'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('metric=cost → 200 with an array body', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=cost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /api/trend — granularity param', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('granularity=week is accepted → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=cost&granularity=week'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('granularity=hour is accepted → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=findings&granularity=hour'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('granularity=month is accepted → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=run_duration&granularity=month'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('invalid granularity returns 400', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=findings&granularity=century'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error', 'invalid granularity');
  });
});

describe('GET /api/trend — optional params (from, to, project)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('custom from+to date range is accepted → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(
      makeRequest('?metric=findings&from=2025-01-01&to=2025-01-31'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('project filter is accepted → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=findings&project=MOB'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('all optional params combined → 200', async () => {
    const { GET } = await import('./route');
    const res = await GET(
      makeRequest(
        '?metric=cost&granularity=week&from=2025-01-01&to=2025-03-31&project=MOB',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /api/trend — graceful degradation without DB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with empty array when no DB pool is available', async () => {
    const { GET } = await import('./route');
    const res = await GET(makeRequest('?metric=findings'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // With no DB, getTrend() returns [] — the API must not error out
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});
