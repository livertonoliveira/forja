/**
 * Unit tests for:
 *   app/api/dlq/[id]/reprocess/route.ts
 *   app/api/dlq/[id]/ignore/route.ts
 *
 * Run:
 *   npx vitest run "app/api/dlq/\[id\]/__tests__/dlq-actions.test.ts"
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mutable mock state — modified per-test
// ---------------------------------------------------------------------------

const mockPoolState = {
  pool: null as null | { query: ReturnType<typeof vi.fn> },
};

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// ---------------------------------------------------------------------------
// Module-level mocks
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

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: (name: string) =>
      name === 'forja-role' ? { value: 'admin' } : undefined,
  })),
}));

vi.mock('@/lib/db', () => ({
  getPool: vi.fn(async () => mockPoolState.pool),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callReprocess(id: string) {
  const { POST } = await import(
    /* @vite-ignore */
    '@/app/api/dlq/[id]/reprocess/route'
  );
  const req = new Request(`http://localhost/api/dlq/${id}/reprocess`, { method: 'POST' });
  const res = await POST(req, { params: { id } });
  const json = await res.json();
  return { status: res.status, json };
}

async function callIgnore(id: string) {
  const { POST } = await import(
    /* @vite-ignore */
    '@/app/api/dlq/[id]/ignore/route'
  );
  const req = new Request(`http://localhost/api/dlq/${id}/ignore`, { method: 'POST' });
  const res = await POST(req, { params: { id } });
  const json = await res.json();
  return { status: res.status, json };
}

function makePool(queryError?: Error) {
  const queryFn = queryError
    ? vi.fn().mockRejectedValue(queryError)
    : vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  return { query: queryFn };
}

beforeEach(() => {
  vi.resetModules();
  mockPoolState.pool = makePool();

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

  vi.mock('next/headers', () => ({
    cookies: vi.fn(() => ({
      get: (name: string) =>
        name === 'forja-role' ? { value: 'admin' } : undefined,
    })),
  }));

  vi.mock('@/lib/db', () => ({
    getPool: vi.fn(async () => mockPoolState.pool),
  }));
});

// ===========================================================================
// REPROCESS ROUTE
// ===========================================================================

describe('POST /api/dlq/[id]/reprocess', () => {
  it('returns 200 { ok: true } on success', async () => {
    const { status, json } = await callReprocess(VALID_UUID);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('calls pool.query with correct SQL to reset status to dead and attempts to 0', async () => {
    const pool = makePool();
    mockPoolState.pool = pool;

    await callReprocess(VALID_UUID);

    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'dead'");
    expect(sql).toContain('attempts = 0');
    expect(sql).toContain('last_attempt_at = NULL');
    expect(sql).toContain('hook_dlq');
    expect(params).toEqual([VALID_UUID]);
  });

  it('returns 503 when pool is null (DB unavailable)', async () => {
    mockPoolState.pool = null;

    const { status, json } = await callReprocess(VALID_UUID);
    expect(status).toBe(503);
    expect(json.error).toContain('DB unavailable');
  });

  it('returns 500 when pool.query throws an error', async () => {
    const pool = makePool(new Error('connection error'));
    mockPoolState.pool = pool;

    const { status, json } = await callReprocess(VALID_UUID);
    expect(status).toBe(500);
    expect(json).toHaveProperty('error');
  });

  it('passes the correct event id as query parameter', async () => {
    const pool = makePool();
    mockPoolState.pool = pool;
    const uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

    await callReprocess(uuid);

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(uuid);
  });
});

// ===========================================================================
// IGNORE ROUTE
// ===========================================================================

describe('POST /api/dlq/[id]/ignore', () => {
  it('returns 200 { ok: true } on success', async () => {
    const { status, json } = await callIgnore(VALID_UUID);
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('calls pool.query with correct SQL to set status to ignored', async () => {
    const pool = makePool();
    mockPoolState.pool = pool;

    await callIgnore(VALID_UUID);

    expect(pool.query).toHaveBeenCalledOnce();
    const [sql, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'ignored'");
    expect(sql).toContain('hook_dlq');
    expect(params).toEqual([VALID_UUID]);
  });

  it('returns 503 when pool is null (DB unavailable)', async () => {
    mockPoolState.pool = null;

    const { status, json } = await callIgnore(VALID_UUID);
    expect(status).toBe(503);
    expect(json.error).toContain('DB unavailable');
  });

  it('returns 500 when pool.query throws an error', async () => {
    const pool = makePool(new Error('connection error'));
    mockPoolState.pool = pool;

    const { status, json } = await callIgnore(VALID_UUID);
    expect(status).toBe(500);
    expect(json).toHaveProperty('error');
  });

  it('passes the correct event id as query parameter', async () => {
    const pool = makePool();
    mockPoolState.pool = pool;
    const uuid = 'b1ffcd88-8d1c-4ef8-bb6d-6bb9bd380a22';

    await callIgnore(uuid);

    const [, params] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBe(uuid);
  });

  it('ignore SQL does NOT reset attempts or last_attempt_at (unlike reprocess)', async () => {
    const pool = makePool();
    mockPoolState.pool = pool;

    await callIgnore(VALID_UUID);

    const [sql] = pool.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('attempts = 0');
    expect(sql).not.toContain('last_attempt_at');
  });
});
