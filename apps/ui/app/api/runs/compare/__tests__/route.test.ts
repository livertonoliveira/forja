/**
 * Integration tests for GET /api/runs/compare (MOB-1070)
 *
 * Test cases:
 *  1. Missing `ids` param → 400 { error: 'ids query param is required' }
 *  2. 1 ID (below minimum) → 400 { error: 'ids must have between 2 and 5 entries' }
 *  3. 6 IDs (above maximum) → 400 { error: 'ids must have between 2 and 5 entries' }
 *  4. Non-UUID string → 400 { error: 'all ids must be valid UUIDs' }
 *  5. Duplicate IDs → 400 { error: 'ids must be unique' }
 *  6. 2 valid UUIDs → calls compareRuns and returns 200
 *  7. 5 valid UUIDs → calls compareRuns and returns 200
 *  8. compareRuns throws → 500 with generic message (no error leak)
 *
 * Run:
 *   npx vitest run apps/ui/app/api/runs/compare/__tests__/route.test.ts --reporter=verbose
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

// Mock compareRuns from forja-store — tests override per-case.
const mockCompareRuns = vi.fn();

vi.mock('@/lib/forja-store', () => ({
  compareRuns: (...args: unknown[]) => mockCompareRuns(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID1 = '11111111-1111-1111-1111-111111111111';
const UUID2 = '22222222-2222-2222-2222-222222222222';
const UUID3 = '33333333-3333-3333-3333-333333333333';
const UUID4 = '44444444-4444-4444-4444-444444444444';
const UUID5 = '55555555-5555-5555-5555-555555555555';
const UUID6 = '66666666-6666-6666-6666-666666666666';

const makeRequest = (idsParam: string | null) => {
  const url = idsParam
    ? `http://localhost/api/runs/compare?ids=${idsParam}`
    : 'http://localhost/api/runs/compare';
  return new Request(url);
};

async function callRoute(idsParam: string | null) {
  const { GET } = await import('../route');
  const res = await GET(makeRequest(idsParam));
  return res as unknown as { _json: unknown; _status: number };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/runs/compare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCompareRuns.mockResolvedValue({});
  });

  // ── 1. Missing ids param ──────────────────────────────────────────────────

  it('returns 400 with required error when ids param is absent', async () => {
    const res = await callRoute(null);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'ids query param is required' });
    expect(mockCompareRuns).not.toHaveBeenCalled();
  });

  // ── 2. 1 ID — below minimum ───────────────────────────────────────────────

  it('returns 400 when only 1 ID is provided (below minimum of 2)', async () => {
    const res = await callRoute(UUID1);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'ids must have between 2 and 5 entries' });
    expect(mockCompareRuns).not.toHaveBeenCalled();
  });

  // ── 3. 6 IDs — above maximum ──────────────────────────────────────────────

  it('returns 400 when 6 IDs are provided (above maximum of 5)', async () => {
    const sixIds = [UUID1, UUID2, UUID3, UUID4, UUID5, UUID6].join(',');
    const res = await callRoute(sixIds);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'ids must have between 2 and 5 entries' });
    expect(mockCompareRuns).not.toHaveBeenCalled();
  });

  // ── 4. Non-UUID string ────────────────────────────────────────────────────

  it('returns 400 when any ID is not a valid UUID format', async () => {
    const res = await callRoute(`${UUID1},not-a-uuid`);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'all ids must be valid UUIDs' });
    expect(mockCompareRuns).not.toHaveBeenCalled();
  });

  // ── 5. Duplicate IDs ──────────────────────────────────────────────────────

  it('returns 400 when duplicate IDs are provided', async () => {
    const res = await callRoute(`${UUID1},${UUID1}`);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'ids must be unique' });
    expect(mockCompareRuns).not.toHaveBeenCalled();
  });

  // ── 6. 2 valid UUIDs → 200 ───────────────────────────────────────────────

  it('calls compareRuns and returns 200 when 2 valid UUIDs are provided', async () => {
    const mockResult = { runs: [{ id: UUID1 }, { id: UUID2 }], diff: [] };
    mockCompareRuns.mockResolvedValueOnce(mockResult);

    const res = await callRoute(`${UUID1},${UUID2}`);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(mockResult);
    expect(mockCompareRuns).toHaveBeenCalledOnce();
    expect(mockCompareRuns).toHaveBeenCalledWith([UUID1, UUID2]);
  });

  // ── 7. 5 valid UUIDs → 200 ───────────────────────────────────────────────

  it('calls compareRuns and returns 200 when 5 valid UUIDs are provided', async () => {
    const fiveIds = [UUID1, UUID2, UUID3, UUID4, UUID5];
    const mockResult = { runs: fiveIds.map((id) => ({ id })), diff: [] };
    mockCompareRuns.mockResolvedValueOnce(mockResult);

    const res = await callRoute(fiveIds.join(','));

    expect(res._status).toBe(200);
    expect(res._json).toEqual(mockResult);
    expect(mockCompareRuns).toHaveBeenCalledOnce();
    expect(mockCompareRuns).toHaveBeenCalledWith(fiveIds);
  });

  // ── 8. compareRuns throws → 500 with generic message (no error leak) ────────

  it('returns 500 with generic error (no internal detail leaked) when compareRuns throws', async () => {
    mockCompareRuns.mockRejectedValueOnce(new Error('DB unavailable'));

    const res = await callRoute(`${UUID1},${UUID2}`);

    expect(res._status).toBe(500);
    expect(res._json).toEqual({ error: 'internal error' });
    expect(mockCompareRuns).toHaveBeenCalledOnce();
  });
});
