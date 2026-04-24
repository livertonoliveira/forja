/**
 * Integration tests for POST /api/issues/create (MOB-1073)
 *
 * Test cases:
 *  1. Missing required fields → 400 with validation error
 *  2. Invalid provider value → 400 { error: 'invalid provider' }
 *  3. Non-UUID findingId → 400 { error: 'invalid findingId' }
 *  4. Missing body (malformed JSON) → 400 { error: 'invalid JSON body' }
 *  5. Missing provider field → 400 validation error
 *  6. Missing title field → 400 validation error
 *  7. Missing description field → 400 validation error
 *  8. Missing findingId field → 400 validation error
 *  9. Valid body with provider=linear → 201 with url starting "https://linear.app"
 * 10. Valid body with provider=jira → 201 with url starting "https://jira.example.com"
 * 11. Valid body with provider=gitlab → 201 with url starting "https://gitlab.com"
 * 12. Response body has "url" field (not "issueUrl")
 *
 * Run:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/app/api/issues/create/__tests__/route.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any import of the SUT
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      _json: data,
      _status: init?.status ?? 200,
    })),
  },
}));

// UUID_RE is imported from @/lib/validation — mock it to use the real regex
vi.mock('@/lib/validation', () => ({
  UUID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteResponse = { _json: unknown; _status: number };

const VALID_UUID = '11111111-1111-1111-1111-111111111111';
const INVALID_UUID = 'not-a-uuid';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/issues/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeMalformedRequest(): Request {
  return new Request('http://localhost/api/issues/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json {{{',
  });
}

async function callRoute(req: Request): Promise<RouteResponse> {
  const { POST } = await import('../route');
  const res = await POST(req);
  return res as unknown as RouteResponse;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/issues/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Malformed JSON body → 400 ─────────────────────────────────────────

  it('returns 400 with "invalid JSON body" for malformed JSON', async () => {
    const res = await callRoute(makeMalformedRequest());

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'invalid JSON body' });
  });

  // ── 2. Missing provider field → 400 ──────────────────────────────────────

  it('returns 400 when provider is missing', async () => {
    const res = await callRoute(makeRequest({
      title: 'My Issue',
      description: 'Description',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('required');
  });

  // ── 3. Missing title field → 400 ─────────────────────────────────────────

  it('returns 400 when title is missing', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      description: 'Description',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('required');
  });

  // ── 4. Missing description field → 400 ───────────────────────────────────

  it('returns 400 when description is missing', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: 'My Issue',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('required');
  });

  // ── 5. Missing findingId field → 400 ──────────────────────────────────────

  it('returns 400 when findingId is missing', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: 'My Issue',
      description: 'Description',
    }));

    expect(res._status).toBe(400);
    expect((res._json as { error: string }).error).toContain('required');
  });

  // ── 6. Invalid provider value → 400 ──────────────────────────────────────

  it('returns 400 with "invalid provider" for an unknown provider', async () => {
    const res = await callRoute(makeRequest({
      provider: 'notion',
      title: 'My Issue',
      description: 'Description',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'invalid provider' });
  });

  // ── 7. Non-UUID findingId → 400 ───────────────────────────────────────────

  it('returns 400 with "invalid findingId" when findingId is not a UUID', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: 'My Issue',
      description: 'Description',
      findingId: INVALID_UUID,
    }));

    expect(res._status).toBe(400);
    expect(res._json).toEqual({ error: 'invalid findingId' });
  });

  // ── 8. Valid body with provider=linear → 201 ─────────────────────────────

  it('returns 201 with a Linear URL when provider is "linear"', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: '[HIGH] SQL Injection',
      description: 'Finding details here',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(201);
    const json = res._json as { url: string };
    expect(json).toHaveProperty('url');
    expect(json.url).toMatch(/^https:\/\/linear\.app\//);
  });

  // ── 9. Valid body with provider=jira → 201 ───────────────────────────────

  it('returns 201 with a Jira URL when provider is "jira"', async () => {
    const res = await callRoute(makeRequest({
      provider: 'jira',
      title: '[MEDIUM] XSS Vulnerability',
      description: 'Cross-site scripting found.',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(201);
    const json = res._json as { url: string };
    expect(json).toHaveProperty('url');
    expect(json.url).toMatch(/^https:\/\/jira\.example\.com\//);
  });

  // ── 10. Valid body with provider=gitlab → 201 ────────────────────────────

  it('returns 201 with a GitLab URL when provider is "gitlab"', async () => {
    const res = await callRoute(makeRequest({
      provider: 'gitlab',
      title: '[LOW] Verbose error logging',
      description: 'Stack traces in production logs.',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(201);
    const json = res._json as { url: string };
    expect(json).toHaveProperty('url');
    expect(json.url).toMatch(/^https:\/\/gitlab\.com\//);
  });

  // ── 11. Response body has "url" field (not "issueUrl") ───────────────────

  it('response body contains "url" key (not "issueUrl")', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: 'Test Issue',
      description: 'Test',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(201);
    const json = res._json as Record<string, unknown>;
    expect(json).toHaveProperty('url');
    expect(json).not.toHaveProperty('issueUrl');
  });

  // ── 12. URL is a non-empty string ─────────────────────────────────────────

  it('returns a non-empty URL string for all valid providers', async () => {
    const providers = ['linear', 'jira', 'gitlab'] as const;

    for (const provider of providers) {
      const res = await callRoute(makeRequest({
        provider,
        title: 'Test',
        description: 'Test',
        findingId: VALID_UUID,
      }));
      const json = res._json as { url: string };
      expect(json.url).toBeTruthy();
      expect(typeof json.url).toBe('string');
    }
  });

  // ── 13. Linear URL contains a 4-digit issue number ───────────────────────

  it('linear URL contains a MOB-NNNN issue identifier', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: 'Test',
      description: 'Test',
      findingId: VALID_UUID,
    }));

    const json = res._json as { url: string };
    expect(json.url).toMatch(/MOB-\d{4}$/);
  });

  // ── 14. Jira URL contains PROJ-NNN pattern ────────────────────────────────

  it('jira URL contains a PROJ-NNN issue identifier', async () => {
    const res = await callRoute(makeRequest({
      provider: 'jira',
      title: 'Test',
      description: 'Test',
      findingId: VALID_UUID,
    }));

    const json = res._json as { url: string };
    expect(json.url).toMatch(/PROJ-\d{3}$/);
  });

  // ── 15. GitLab URL contains numeric issue id ──────────────────────────────

  it('gitlab URL contains a numeric issue id at the end', async () => {
    const res = await callRoute(makeRequest({
      provider: 'gitlab',
      title: 'Test',
      description: 'Test',
      findingId: VALID_UUID,
    }));

    const json = res._json as { url: string };
    expect(json.url).toMatch(/\/issues\/\d+$/);
  });

  // ── 16. Empty string title → 400 ─────────────────────────────────────────

  it('returns 400 when title is an empty string', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: '',
      description: 'Description',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(400);
  });

  // ── 17. Empty string description → 400 ───────────────────────────────────

  it('returns 400 when description is an empty string', async () => {
    const res = await callRoute(makeRequest({
      provider: 'linear',
      title: 'My Issue',
      description: '',
      findingId: VALID_UUID,
    }));

    expect(res._status).toBe(400);
  });
});
