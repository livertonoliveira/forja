/**
 * Integration tests for DLQ API routes (MOB-1092)
 *
 * Run:
 *   cd apps/ui && npx vitest run app/api/dlq/__tests__ --reporter=verbose
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks — must be declared before importing the route handlers
// ---------------------------------------------------------------------------

const mockQuery = vi.fn();

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(async () => ({
    query: mockQuery,
  })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: (name: string) =>
      name === 'forja-role' ? { value: 'admin' } : undefined,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

function makeRequest(url: string): Request {
  return new Request(url);
}

function makeNextRequest(url: string) {
  return new Request(url) as unknown as import('next/server').NextRequest;
}

// ---------------------------------------------------------------------------
// 1. GET /api/dlq
// ---------------------------------------------------------------------------

describe('GET /api/dlq', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { events: [], total: 0 } when pool is null (no DB)', async () => {
    const { getPool } = await import('@/lib/db');
    vi.mocked(getPool).mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/dlq/route');
    const req = makeNextRequest('http://localhost/api/dlq');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.events).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns 400 for an invalid status param', async () => {
    const { GET } = await import('@/app/api/dlq/route');
    const req = makeNextRequest('http://localhost/api/dlq?status=invalid');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid status value');
  });

  it('returns events filtered by a valid status param', async () => {
    const dbRow = {
      id: VALID_UUID,
      hook_type: 'github.push',
      payload: { ref: 'refs/heads/main' },
      error_message: 'timeout',
      attempts: 3,
      last_attempt_at: '2026-04-01T10:00:00.000Z',
      created_at: '2026-04-01T09:00:00.000Z',
      status: 'dead',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [dbRow] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const { GET } = await import('@/app/api/dlq/route');
    const req = makeNextRequest('http://localhost/api/dlq?status=dead');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.events).toHaveLength(1);

    const [eventsCall, countCall] = mockQuery.mock.calls;
    expect(eventsCall[0]).toContain('status = $1');
    expect(eventsCall[1]).toContain('dead');
    expect(countCall[0]).toContain('status = $1');
    expect(countCall[1]).toContain('dead');
  });

  it('applies correct LIMIT and OFFSET to the query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const { GET } = await import('@/app/api/dlq/route');
    const req = makeNextRequest('http://localhost/api/dlq?limit=10&offset=20');
    const res = await GET(req);

    expect(res.status).toBe(200);

    const eventsCallArgs = mockQuery.mock.calls[0][1] as unknown[];
    expect(eventsCallArgs).toEqual([10, 20]);
  });

  it('maps DB columns (snake_case) to camelCase correctly', async () => {
    const dbRow = {
      id: VALID_UUID,
      hook_type: 'stripe.payment',
      payload: { amount: 100 },
      error_message: 'connection refused',
      attempts: 5,
      last_attempt_at: '2026-04-10T12:00:00.000Z',
      created_at: '2026-04-10T11:00:00.000Z',
      status: 'dead',
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [dbRow] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const { GET } = await import('@/app/api/dlq/route');
    const req = makeNextRequest('http://localhost/api/dlq');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    const event = body.events[0];

    expect(event.id).toBe(dbRow.id);
    expect(event.hookType).toBe(dbRow.hook_type);
    expect(event.payload).toEqual(dbRow.payload);
    expect(event.errorMessage).toBe(dbRow.error_message);
    expect(event.attempts).toBe(dbRow.attempts);
    expect(event.lastAttemptAt).toBe(dbRow.last_attempt_at);
    expect(event.createdAt).toBe(dbRow.created_at);
    expect(event.status).toBe(dbRow.status);

    expect(event).not.toHaveProperty('hook_type');
    expect(event).not.toHaveProperty('error_message');
    expect(event).not.toHaveProperty('last_attempt_at');
    expect(event).not.toHaveProperty('created_at');
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/dlq/[id]/reprocess
// ---------------------------------------------------------------------------

describe('POST /api/dlq/[id]/reprocess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when pool is null', async () => {
    const { getPool } = await import('@/lib/db');
    vi.mocked(getPool).mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/dlq/[id]/reprocess/route');
    const res = await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID}/reprocess`), {
      params: { id: VALID_UUID },
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe('DB unavailable');
  });

  it('executes the correct SQL to reset the event for reprocessing', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const { POST } = await import('@/app/api/dlq/[id]/reprocess/route');
    await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID_2}/reprocess`), {
      params: { id: VALID_UUID_2 },
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("SET status = 'dead'");
    expect(sql).toContain('attempts = 0');
    expect(sql).toContain('last_attempt_at = NULL');
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual([VALID_UUID_2]);
  });

  it('returns { ok: true } on success', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const { POST } = await import('@/app/api/dlq/[id]/reprocess/route');
    const res = await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID_2}/reprocess`), {
      params: { id: VALID_UUID_2 },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection lost'));

    const { POST } = await import('@/app/api/dlq/[id]/reprocess/route');
    const res = await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID_2}/reprocess`), {
      params: { id: VALID_UUID_2 },
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');
  });
});

// ---------------------------------------------------------------------------
// 3. POST /api/dlq/[id]/ignore
// ---------------------------------------------------------------------------

describe('POST /api/dlq/[id]/ignore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when pool is null', async () => {
    const { getPool } = await import('@/lib/db');
    vi.mocked(getPool).mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/dlq/[id]/ignore/route');
    const res = await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID}/ignore`), {
      params: { id: VALID_UUID },
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe('DB unavailable');
  });

  it('executes the correct SQL to mark the event as ignored', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const { POST } = await import('@/app/api/dlq/[id]/ignore/route');
    await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID_2}/ignore`), {
      params: { id: VALID_UUID_2 },
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("SET status = 'ignored'");
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual([VALID_UUID_2]);
  });

  it('returns { ok: true } on success', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const { POST } = await import('@/app/api/dlq/[id]/ignore/route');
    const res = await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID_2}/ignore`), {
      params: { id: VALID_UUID_2 },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('returns 500 on DB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('timeout'));

    const { POST } = await import('@/app/api/dlq/[id]/ignore/route');
    const res = await POST(makeRequest(`http://localhost/api/dlq/${VALID_UUID_2}/ignore`), {
      params: { id: VALID_UUID_2 },
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');
  });
});
