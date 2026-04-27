/**
 * Integration tests for GET /api/cost/breakdown (MOB-1074)
 *
 * Tests route handler in isolation: query param validation, store delegation,
 * successful responses, and error handling. The store function is mocked so no
 * real DB connection is needed.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/app/api/cost/breakdown/__tests__/route.test.ts
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

const mockGetCostBreakdownByProject = vi.fn();

vi.mock('@/lib/forja-store', () => ({
  getCostBreakdownByProject: (...args: unknown[]) =>
    mockGetCostBreakdownByProject(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(search = ''): Request {
  return new Request(`http://localhost/api/cost/breakdown${search}`);
}

async function callRoute(search = '') {
  const { GET } = await import('../route');
  const res = await GET(makeRequest(search));
  const json = await res.json();
  return { status: res.status, json };
}

const SAMPLE_BREAKDOWN = [
  {
    project: 'MOB',
    totalCost: 5.0,
    inputCost: 0,
    outputCost: 0,
    cacheCost: 0,
    runCount: 20,
  },
  {
    project: 'WEB',
    totalCost: 2.5,
    inputCost: 0,
    outputCost: 0,
    cacheCost: 0,
    runCount: 8,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cost/breakdown — successful responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCostBreakdownByProject.mockResolvedValue(SAMPLE_BREAKDOWN);
  });

  it('returns 200 with breakdown array on default request (no params)', async () => {
    const { status, json } = await callRoute();

    expect(status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(2);
  });

  it('returns correct shape for each row (project, totalCost, inputCost, outputCost, cacheCost, runCount)', async () => {
    const { json } = await callRoute();

    const row = json[0];
    expect(row).toHaveProperty('project');
    expect(row).toHaveProperty('totalCost');
    expect(row).toHaveProperty('inputCost');
    expect(row).toHaveProperty('outputCost');
    expect(row).toHaveProperty('cacheCost');
    expect(row).toHaveProperty('runCount');
  });

  it('returns 200 with empty array when store returns []', async () => {
    mockGetCostBreakdownByProject.mockResolvedValue([]);

    const { status, json } = await callRoute();

    expect(status).toBe(200);
    expect(json).toEqual([]);
  });

  it('passes from query param to the store', async () => {
    const { status } = await callRoute('?from=2025-01-01');

    expect(status).toBe(200);
    expect(mockGetCostBreakdownByProject).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2025-01-01' }),
    );
  });

  it('passes to query param to the store', async () => {
    const { status } = await callRoute('?to=2025-01-31');

    expect(status).toBe(200);
    expect(mockGetCostBreakdownByProject).toHaveBeenCalledWith(
      expect.objectContaining({ to: '2025-01-31' }),
    );
  });

  it('passes limit query param as integer to the store', async () => {
    const { status } = await callRoute('?limit=10');

    expect(status).toBe(200);
    expect(mockGetCostBreakdownByProject).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('passes from, to, and limit together to the store', async () => {
    await callRoute('?from=2025-01-01&to=2025-01-31&limit=5');

    expect(mockGetCostBreakdownByProject).toHaveBeenCalledWith({
      from: '2025-01-01',
      to: '2025-01-31',
      limit: 5,
    });
  });
});

describe('GET /api/cost/breakdown — query param validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCostBreakdownByProject.mockResolvedValue([]);
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

  it('returns 400 when limit is 0 (below minimum)', async () => {
    const { status, json } = await callRoute('?limit=0');

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/invalid limit/i);
  });

  it('returns 400 when limit is a non-numeric string', async () => {
    const { status, json } = await callRoute('?limit=abc');

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/invalid limit/i);
  });

  it('returns 400 when limit is negative', async () => {
    const { status, json } = await callRoute('?limit=-1');

    expect(status).toBe(400);
    expect(json).toHaveProperty('error');
    expect(json.error).toMatch(/invalid limit/i);
  });

  it('accepts a valid ISO date string for from without error', async () => {
    const { status } = await callRoute('?from=2025-01-01T00:00:00Z');

    expect(status).toBe(200);
  });

  it('accepts a valid ISO date string for to without error', async () => {
    const { status } = await callRoute('?to=2025-12-31T23:59:59Z');

    expect(status).toBe(200);
  });

  it('accepts limit=1 (minimum valid value)', async () => {
    const { status } = await callRoute('?limit=1');

    expect(status).toBe(200);
  });
});

describe('GET /api/cost/breakdown — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 when the store throws an unexpected error', async () => {
    mockGetCostBreakdownByProject.mockRejectedValue(new Error('unexpected crash'));

    const { status, json } = await callRoute();

    expect(status).toBe(500);
    expect(json).toHaveProperty('error');
  });
});
