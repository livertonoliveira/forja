/**
 * Unit tests for `withRetry`, `HttpError`, and `RetryConfig` in src/hooks/retry.ts
 *
 * Uses vi.useFakeTimers() for timing-sensitive tests to avoid real delays.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError, withRetry } from './retry.js';
import type { RetryConfig } from './retry.js';

// ---------------------------------------------------------------------------
// Shared config — deterministic (no jitter, small values)
// ---------------------------------------------------------------------------

const BASE_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 10_000,
  jitter: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function neverExhausted(): (e: Error) => Promise<void> {
  return vi.fn().mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Suite 1: Success on first attempt
// ---------------------------------------------------------------------------

describe('withRetry — success on first attempt', () => {
  it('returns the resolved value without retrying', async () => {
    const fn = vi.fn().mockResolvedValueOnce('ok');
    const onExhausted = neverExhausted();

    const result = await withRetry(fn, BASE_CONFIG, onExhausted);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
    expect(onExhausted).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Success on 3rd attempt
// ---------------------------------------------------------------------------

describe('withRetry — success on 3rd attempt', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns the value and does not call onExhausted', async () => {
    const error = new Error('transient');
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('third');

    const onExhausted = neverExhausted();

    const promise = withRetry(fn, BASE_CONFIG, onExhausted);
    // Advance past the two delays (attempt 0 → 100ms, attempt 1 → 200ms)
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('third');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onExhausted).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Retry exhaustion
// ---------------------------------------------------------------------------

describe('withRetry — retry exhaustion', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls onExhausted with the last error after maxRetries attempts and returns void', async () => {
    const lastError = new Error('always fails');
    const fn = vi.fn().mockRejectedValue(lastError);
    const onExhausted = neverExhausted();

    const promise = withRetry(fn, BASE_CONFIG, onExhausted);
    await vi.runAllTimersAsync();
    const result = await promise;

    // maxRetries=3 → 4 total attempts (0, 1, 2, 3)
    expect(fn).toHaveBeenCalledTimes(BASE_CONFIG.maxRetries + 1);
    expect(onExhausted).toHaveBeenCalledOnce();
    expect(onExhausted).toHaveBeenCalledWith(lastError);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Retry-After header respected
// ---------------------------------------------------------------------------

describe('withRetry — Retry-After header respected', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('uses Retry-After seconds converted to ms instead of calcBackoff result', async () => {
    // 5s is within BASE_CONFIG.maxDelayMs (10_000ms), so no capping occurs
    const retryAfterSeconds = 5;
    const expectedDelayMs = retryAfterSeconds * 1000; // 5_000

    // fn throws 429 with Retry-After on first call, then succeeds
    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError(429, String(retryAfterSeconds)))
      .mockResolvedValueOnce('after-retry');

    const onExhausted = neverExhausted();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = withRetry(fn, BASE_CONFIG, onExhausted);
    await vi.runAllTimersAsync();
    await promise;

    // Find the setTimeout call that corresponds to the retry delay
    const delayCalls = setTimeoutSpy.mock.calls.map(([, ms]) => ms as number);
    expect(delayCalls).toContain(expectedDelayMs);

    // calcBackoff for attempt=0 with jitter=false: baseDelayMs * 2^0 = 100ms
    // The delay must NOT be 100ms — it must be the Retry-After value
    expect(delayCalls.some(ms => ms === expectedDelayMs)).toBe(true);

    setTimeoutSpy.mockRestore();
  });

  it('caps Retry-After delay at maxDelayMs when Retry-After exceeds it', async () => {
    // 60s exceeds BASE_CONFIG.maxDelayMs (10_000ms), so it must be capped
    const retryAfterSeconds = 60;
    const expectedDelayMs = BASE_CONFIG.maxDelayMs; // 10_000 (capped)

    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError(429, String(retryAfterSeconds)))
      .mockResolvedValueOnce('after-retry');

    const onExhausted = neverExhausted();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = withRetry(fn, BASE_CONFIG, onExhausted);
    await vi.runAllTimersAsync();
    await promise;

    const delayCalls = setTimeoutSpy.mock.calls.map(([, ms]) => ms as number);
    // Delay must be capped at maxDelayMs, not the raw Retry-After value
    expect(delayCalls).toContain(expectedDelayMs);
    expect(delayCalls).not.toContain(retryAfterSeconds * 1000); // 60_000 must not appear

    setTimeoutSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Suite 5: 4xx non-retryable
// ---------------------------------------------------------------------------

describe('withRetry — 4xx non-retryable (except 429)', () => {
  it('calls onExhausted immediately on first attempt for HttpError(400)', async () => {
    const error = new HttpError(400);
    const fn = vi.fn().mockRejectedValue(error);
    const onExhausted = neverExhausted();

    const result = await withRetry(fn, BASE_CONFIG, onExhausted);

    // Should fail immediately without retrying
    expect(fn).toHaveBeenCalledOnce();
    expect(onExhausted).toHaveBeenCalledOnce();
    expect(onExhausted).toHaveBeenCalledWith(error);
    expect(result).toBeUndefined();
  });

  it.each([400, 401, 403, 404, 422])(
    'calls onExhausted immediately for HttpError(%i)',
    async (status) => {
      const fn = vi.fn().mockRejectedValue(new HttpError(status));
      const onExhausted = neverExhausted();

      await withRetry(fn, BASE_CONFIG, onExhausted);

      expect(fn).toHaveBeenCalledOnce();
      expect(onExhausted).toHaveBeenCalledOnce();
    }
  );
});

// ---------------------------------------------------------------------------
// Suite 6: 429 IS retryable
// ---------------------------------------------------------------------------

describe('withRetry — 429 is retryable', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('retries on 429 and only calls onExhausted after maxRetries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(429));
    const onExhausted = neverExhausted();

    const promise = withRetry(fn, BASE_CONFIG, onExhausted);
    await vi.runAllTimersAsync();
    await promise;

    // maxRetries=3 → 4 total attempts
    expect(fn).toHaveBeenCalledTimes(BASE_CONFIG.maxRetries + 1);
    expect(onExhausted).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Logging format
// ---------------------------------------------------------------------------

describe('withRetry — logging', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('logs in format "[forja] retry: attempt X/N (hookType), status=CODE, delayMs=MS" for each retry', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError(503))
      .mockRejectedValueOnce(new HttpError(503))
      .mockResolvedValueOnce('done');

    const promise = withRetry(fn, BASE_CONFIG, neverExhausted(), 'pre-tool-use');
    await vi.runAllTimersAsync();
    await promise;

    // Two failures → two log calls
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    const [firstCall] = consoleSpy.mock.calls;
    const [firstMessage] = firstCall;

    // Must match the documented format
    expect(firstMessage).toMatch(/^\[forja\] retry: attempt \d+\/\d+ \(pre-tool-use\), status=503, delayMs=\d+$/);

    // First retry is attempt 1 out of maxRetries=3
    expect(firstMessage).toContain('attempt 1/3');
    expect(firstMessage).toContain('(pre-tool-use)');
    expect(firstMessage).toContain('status=503');

    consoleSpy.mockRestore();
  });

  it('logs without hookType when hookType is undefined', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const fn = vi.fn()
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValueOnce('done');

    const promise = withRetry(fn, BASE_CONFIG, neverExhausted());
    await vi.runAllTimersAsync();
    await promise;

    expect(consoleSpy).toHaveBeenCalledOnce();
    const [message] = consoleSpy.mock.calls[0];

    // No parenthesized hookType
    expect(message).not.toMatch(/\(\w/);
    expect(message).toContain('[forja] retry: attempt 1/3');
    expect(message).toContain('status=500');

    consoleSpy.mockRestore();
  });

  it('logs the correct attempt number on each retry', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const error = new Error('boom');
    const fn = vi.fn().mockRejectedValue(error);

    const config: RetryConfig = { ...BASE_CONFIG, maxRetries: 2 };
    const promise = withRetry(fn, config, neverExhausted(), 'stop');
    await vi.runAllTimersAsync();
    await promise;

    // maxRetries=2 → 2 retry log lines (attempts 0 and 1 fail with logs; attempt 2 triggers onExhausted, no log)
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    const messages = consoleSpy.mock.calls.map(([m]) => m as string);
    expect(messages[0]).toContain('attempt 1/2');
    expect(messages[1]).toContain('attempt 2/2');

    consoleSpy.mockRestore();
  });
});
