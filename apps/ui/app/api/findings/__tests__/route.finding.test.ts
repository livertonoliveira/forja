/**
 * Integration tests for:
 *   GET /api/findings/[findingId]         (MOB-1072)
 *   GET /api/findings/[findingId]/history (MOB-1072)
 *
 * Test cases — findingId route:
 *  1. Non-UUID string → 400 { error: 'invalid findingId' }
 *  2. Valid UUID, getFinding returns null → 404 { error: 'finding not found' }
 *  3. Valid UUID, getFinding returns data → 200 with finding payload
 *
 * Test cases — history route:
 *  4. Non-UUID string → 400 { error: 'invalid findingId' }
 *  5. Valid UUID, getFindingHistory returns empty array → 200 []
 *  6. Valid UUID, getFindingHistory returns history items → 200 with items
 *
 * Run:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/app/api/findings/__tests__/route.finding.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before any import of the SUT
// ---------------------------------------------------------------------------

// Provide a minimal NextResponse.json implementation so the routes can run
// outside a real Next.js runtime.
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      _json: data,
      _status: init?.status ?? 200,
    })),
  },
}));

// Mock getFinding and getFindingHistory from forja-store — tests override per-case.
const mockGetFinding = vi.fn();
const mockGetFindingHistory = vi.fn();

vi.mock('@/lib/forja-store', () => ({
  getFinding: (...args: unknown[]) => mockGetFinding(...args),
  getFindingHistory: (...args: unknown[]) => mockGetFindingHistory(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const INVALID_ID = 'not-a-uuid';

type RouteResponse = { _json: unknown; _status: number };

async function callFindingRoute(findingId: string): Promise<RouteResponse> {
  const { GET } = await import('../[findingId]/route');
  const req = new Request(`http://localhost/api/findings/${findingId}`);
  const res = await GET(req, { params: { findingId } });
  return res as unknown as RouteResponse;
}

async function callHistoryRoute(findingId: string): Promise<RouteResponse> {
  const { GET } = await import('../[findingId]/history/route');
  const req = new Request(`http://localhost/api/findings/${findingId}/history`);
  const res = await GET(req, { params: { findingId } });
  return res as unknown as RouteResponse;
}

// ---------------------------------------------------------------------------
// Tests — GET /api/findings/[findingId]
// ---------------------------------------------------------------------------

describe('GET /api/findings/[findingId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFinding.mockResolvedValue(null);
  });

  // ── 1. Non-UUID string → 400 ────────────────────────────────────────────

  it('returns 400 when findingId is not a valid UUID', async () => {
    const res = await callFindingRoute(INVALID_ID);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'invalid findingId' });
    expect(mockGetFinding).not.toHaveBeenCalled();
  });

  // ── 2. Valid UUID but finding not found → 404 ───────────────────────────

  it('returns 404 when getFinding returns null', async () => {
    mockGetFinding.mockResolvedValueOnce(null);

    const res = await callFindingRoute(VALID_UUID);

    expect(res._status).toBe(404);
    expect(res._json).toEqual({ error: 'finding not found' });
    expect(mockGetFinding).toHaveBeenCalledOnce();
    expect(mockGetFinding).toHaveBeenCalledWith(VALID_UUID);
  });

  // ── 3. Valid UUID and finding exists → 200 ──────────────────────────────

  it('returns 200 with finding data when getFinding returns a FindingDetail', async () => {
    const mockFinding = {
      id: VALID_UUID,
      fingerprint: 'abc123',
      title: 'SQL Injection',
      severity: 'high',
      status: 'open',
    };
    mockGetFinding.mockResolvedValueOnce(mockFinding);

    const res = await callFindingRoute(VALID_UUID);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(mockFinding);
    expect(mockGetFinding).toHaveBeenCalledOnce();
    expect(mockGetFinding).toHaveBeenCalledWith(VALID_UUID);
  });
});

// ---------------------------------------------------------------------------
// Tests — GET /api/findings/[findingId]/history
// ---------------------------------------------------------------------------

describe('GET /api/findings/[findingId]/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFindingHistory.mockResolvedValue([]);
  });

  // ── 4. Non-UUID string → 400 ────────────────────────────────────────────

  it('returns 400 when findingId is not a valid UUID', async () => {
    const res = await callHistoryRoute(INVALID_ID);

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'invalid findingId' });
    expect(mockGetFindingHistory).not.toHaveBeenCalled();
  });

  // ── 5. Valid UUID, empty history → 200 [] ──────────────────────────────

  it('returns 200 with empty array when getFindingHistory returns no items', async () => {
    mockGetFindingHistory.mockResolvedValueOnce([]);

    const res = await callHistoryRoute(VALID_UUID);

    expect(res._status).toBe(200);
    expect(res._json).toEqual([]);
    expect(mockGetFindingHistory).toHaveBeenCalledOnce();
    expect(mockGetFindingHistory).toHaveBeenCalledWith(VALID_UUID);
  });

  // ── 6. Valid UUID, history items → 200 with items ───────────────────────

  it('returns 200 with history items when getFindingHistory returns data', async () => {
    const mockHistory = [
      { runId: 'run-1', detectedAt: '2024-01-01', status: 'open' },
      { runId: 'run-2', detectedAt: '2024-01-02', status: 'fixed' },
    ];
    mockGetFindingHistory.mockResolvedValueOnce(mockHistory);

    const res = await callHistoryRoute(VALID_UUID);

    expect(res._status).toBe(200);
    expect(res._json).toEqual(mockHistory);
    expect(mockGetFindingHistory).toHaveBeenCalledOnce();
    expect(mockGetFindingHistory).toHaveBeenCalledWith(VALID_UUID);
  });
});
