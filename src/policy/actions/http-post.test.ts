/**
 * Unit tests for `src/policy/actions/http-post.ts` — MOB-1015.
 *
 * Covers:
 *   - interpolateObject: {{runId}} and {{ENV_VAR}} replacement, recursive objects
 *   - httpPost: sends POST with correct headers and interpolated payload
 *   - httpPost: Content-Type: application/json always included
 *   - httpPost: non-200 response logs warning and does NOT throw
 *   - fetchWithRetry: retries up to 2 times on network error with 1s backoff
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { interpolateObject, httpPost } from './http-post.js';
import type { ActionContext } from '../actions.js';
import { resetCircuitBreakers } from '../../hooks/circuit-breaker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => { resetCircuitBreakers(); });

const makeContext = (runId = 'run-abc-123'): ActionContext => ({ runId });

function makeOkResponse(status = 200): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

// ---------------------------------------------------------------------------
// interpolateObject
// ---------------------------------------------------------------------------

describe('interpolateObject — {{runId}} substitution', () => {
  it('replaces {{runId}} with context.runId', () => {
    const result = interpolateObject({ id: '{{runId}}' }, makeContext('run-42'));
    expect(result).toEqual({ id: 'run-42' });
  });

  it('leaves non-template strings untouched', () => {
    const result = interpolateObject({ key: 'static-value' }, makeContext());
    expect(result).toEqual({ key: 'static-value' });
  });

  it('preserves non-string values as-is', () => {
    const result = interpolateObject({ count: 5 as unknown as string, flag: true as unknown as string }, makeContext());
    expect(result).toEqual({ count: 5, flag: true });
  });
});

describe('interpolateObject — {{ENV_VAR}} substitution', () => {
  beforeEach(() => {
    vi.stubEnv('MY_WEBHOOK_SECRET', 'secret-token');
    vi.stubEnv('EMPTY_VAR', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('replaces {{MY_WEBHOOK_SECRET}} with the env value', () => {
    const result = interpolateObject({ token: '{{MY_WEBHOOK_SECRET}}' }, makeContext());
    expect(result).toEqual({ token: 'secret-token' });
  });

  it('replaces an unset env var with empty string', () => {
    const result = interpolateObject({ x: '{{UNDEFINED_VAR_XYZ}}' }, makeContext());
    expect(result).toEqual({ x: '' });
  });

  it('replaces an explicitly empty env var with empty string', () => {
    const result = interpolateObject({ x: '{{EMPTY_VAR}}' }, makeContext());
    expect(result).toEqual({ x: '' });
  });
});

describe('interpolateObject — recursive nested objects', () => {
  it('interpolates string values in nested objects', () => {
    const obj = { outer: { inner: '{{runId}}' } };
    const result = interpolateObject(obj, makeContext('run-nested'));
    expect((result.outer as Record<string, unknown>).inner).toBe('run-nested');
  });

  it('leaves arrays untouched (not recursed)', () => {
    const obj = { tags: ['{{runId}}', 'static'] as unknown as string };
    const result = interpolateObject(obj, makeContext('run-arr'));
    // Arrays are not Record<string, unknown>, so they pass through unchanged
    expect(result.tags).toEqual(['{{runId}}', 'static']);
  });
});

// ---------------------------------------------------------------------------
// httpPost — happy path
// ---------------------------------------------------------------------------

describe('httpPost — successful POST', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse(200));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetch with method POST', async () => {
    await httpPost({ url: 'https://example.com/hook', context: makeContext() });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('sends the correct URL', async () => {
    await httpPost({ url: 'https://example.com/webhook', context: makeContext() });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/webhook');
  });

  it('always includes Content-Type: application/json', async () => {
    await httpPost({ url: 'https://example.com/hook', context: makeContext() });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('sends interpolated payload as JSON body', async () => {
    await httpPost({
      url: 'https://example.com/hook',
      payload: { runId: '{{runId}}', event: 'finding' },
      context: makeContext('run-xyz'),
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ runId: 'run-xyz', event: 'finding' });
  });

  it('sends interpolated custom headers', async () => {
    vi.stubEnv('API_TOKEN', 'tok-123');
    await httpPost({
      url: 'https://example.com/hook',
      headers: { Authorization: 'Bearer {{API_TOKEN}}' },
      context: makeContext(),
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    vi.unstubAllEnvs();
  });

  it('sends empty JSON object when payload is omitted', async () => {
    await httpPost({ url: 'https://example.com/hook', context: makeContext() });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// httpPost — non-200 response: warns and does NOT throw
// ---------------------------------------------------------------------------

describe('httpPost — non-200 response', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse(500));
    vi.stubGlobal('fetch', fetchMock);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  it('does NOT throw on HTTP 500', async () => {
    await expect(
      httpPost({ url: 'https://example.com/hook', context: makeContext() })
    ).resolves.toBeUndefined();
  });

  it('logs a warning containing the status code on non-200', async () => {
    await httpPost({ url: 'https://example.com/hook', context: makeContext() });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('does NOT throw on HTTP 404', async () => {
    fetchMock.mockResolvedValue(makeOkResponse(404));
    await expect(
      httpPost({ url: 'https://example.com/hook', context: makeContext() })
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchWithRetry — retries on network error with backoff
// ---------------------------------------------------------------------------

describe('httpPost — retry on network error', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  it('retries up to 2 times and succeeds on 3rd attempt', async () => {
    fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error 1'))
      .mockRejectedValueOnce(new Error('network error 2'))
      .mockResolvedValue(makeOkResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    const postPromise = httpPost({ url: 'https://example.com/hook', context: makeContext() });

    // Advance timers for the two 1s backoff sleeps
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await postPromise;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does NOT throw after exhausting all retries — swallows network error', async () => {
    fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('persistent network error'));
    vi.stubGlobal('fetch', fetchMock);

    const postPromise = httpPost({ url: 'https://example.com/hook', context: makeContext() });

    // Advance timers through all retry backoffs (attempt 1 → +1s, attempt 2 → +1s)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(postPromise).resolves.toBeUndefined();
    // 1 original + 2 retries = 3 total calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('logs a warning after exhausting all retries', async () => {
    fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    const postPromise = httpPost({ url: 'https://example.com/hook', context: makeContext() });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await postPromise;

    // Should warn about the final failure after retries
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('after retries'));
  });

  it('makes exactly 1 call when fetch succeeds on first attempt (no retry)', async () => {
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse(200));
    vi.stubGlobal('fetch', fetchMock);

    await httpPost({ url: 'https://example.com/hook', context: makeContext() });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// httpPost — URL validation (SSRF protection)
// ---------------------------------------------------------------------------

describe('httpPost — URL validation', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    vi.useRealTimers();
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse(200));
    vi.stubGlobal('fetch', fetchMock);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  it('skips and warns when url is http:// (not https)', async () => {
    await httpPost({ url: 'http://example.com/hook', context: makeContext() });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('https://'));
  });

  it('skips and warns when url is empty string', async () => {
    await httpPost({ url: '', context: makeContext() });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('skips and warns for internal network URL (http://127.0.0.1)', async () => {
    await httpPost({ url: 'http://127.0.0.1:6379', context: makeContext() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proceeds normally for valid https:// URL', async () => {
    await httpPost({ url: 'https://hooks.example.com/webhook', context: makeContext() });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// httpPost — secret masking in logs
// ---------------------------------------------------------------------------

describe('httpPost — secret masking in logs', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    vi.useRealTimers();
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse(500));
    vi.stubGlobal('fetch', fetchMock);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  it('masks query string in warning log on non-200', async () => {
    await httpPost({ url: 'https://example.com/hook?token=super-secret', context: makeContext() });
    const warnMessage: string = warnSpy.mock.calls[0][0];
    expect(warnMessage).not.toContain('super-secret');
    expect(warnMessage).toContain('<redacted>');
  });
});
