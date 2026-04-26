/**
 * Unit tests for CircuitBreaker, CircuitOpenError, getCircuitBreaker,
 * and listCircuitBreakers in src/hooks/circuit-breaker.ts
 *
 * Uses vi.useFakeTimers() for timing-sensitive tests (sliding window,
 * cooldown) to avoid real delays.
 *
 * Registry isolation strategy:
 *   - Direct `new CircuitBreaker(name, config)` instances for unit tests
 *     (no registry involved, no cross-test pollution).
 *   - Unique endpoint name per test group when testing getCircuitBreaker /
 *     listCircuitBreakers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  listCircuitBreakers,
} from './circuit-breaker.js';
import type { CircuitBreakerConfig } from './circuit-breaker.js';
import { tracer } from '../otel/tracer.js';

// ---------------------------------------------------------------------------
// Shared test config — small thresholds to keep tests fast
// ---------------------------------------------------------------------------

const BASE_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 60_000,
  successThreshold: 2,
};

/** Returns a fn that always resolves with the given value. */
function succeed<T>(value: T): () => Promise<T> {
  return vi.fn().mockResolvedValue(value);
}

/** Returns a fn that always rejects with the given error. */
function fail(err: Error = new Error('boom')): () => Promise<never> {
  return vi.fn().mockRejectedValue(err);
}

/** Drive a CircuitBreaker to the open state by triggering failureThreshold failures. */
async function openCircuit(
  cb: CircuitBreaker,
  config: CircuitBreakerConfig = BASE_CONFIG,
): Promise<void> {
  for (let i = 0; i < config.failureThreshold; i++) {
    await expect(cb.call(fail())).rejects.toThrow();
  }
}

// ---------------------------------------------------------------------------
// Suite 1: CircuitOpenError
// ---------------------------------------------------------------------------

describe('CircuitOpenError', () => {
  it('has name "CircuitOpenError"', () => {
    const err = new CircuitOpenError('my-endpoint');
    expect(err.name).toBe('CircuitOpenError');
  });

  it('message contains the endpoint name', () => {
    const err = new CircuitOpenError('https://api.example.com');
    expect(err.message).toContain('https://api.example.com');
  });

  it('is an instance of Error', () => {
    expect(new CircuitOpenError('x')).toBeInstanceOf(Error);
  });

  it('message is descriptive — starts with "circuit open:"', () => {
    const err = new CircuitOpenError('ep');
    expect(err.message).toMatch(/^circuit open:/);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Initial state / getStatus
// ---------------------------------------------------------------------------

describe('CircuitBreaker — initial state', () => {
  it('starts in closed state', () => {
    const cb = new CircuitBreaker('init-test', BASE_CONFIG);
    expect(cb.getStatus().state).toBe('closed');
  });

  it('getStatus returns correct endpoint name', () => {
    const cb = new CircuitBreaker('my-service', BASE_CONFIG);
    expect(cb.getStatus().endpoint).toBe('my-service');
  });

  it('getStatus reports zero failures on a new instance', () => {
    const cb = new CircuitBreaker('fresh', BASE_CONFIG);
    expect(cb.getStatus().failures).toBe(0);
  });

  it('calls go through without error while closed', async () => {
    const cb = new CircuitBreaker('passthrough', BASE_CONFIG);
    const result = await cb.call(succeed(42));
    expect(result).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Closed → Open transition (acceptance criterion 1)
// ---------------------------------------------------------------------------

describe('CircuitBreaker — closed → open after failureThreshold', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('opens after exactly failureThreshold failures within the window', async () => {
    const cb = new CircuitBreaker('open-test', BASE_CONFIG);
    await openCircuit(cb);
    expect(cb.getStatus().state).toBe('open');
  });

  it('subsequent calls throw CircuitOpenError immediately once open', async () => {
    const cb = new CircuitBreaker('fast-fail', BASE_CONFIG);
    await openCircuit(cb);

    const start = Date.now();
    await expect(cb.call(succeed('never'))).rejects.toThrow(CircuitOpenError);
    // CircuitOpenError is thrown synchronously — no async work needed
    expect(Date.now() - start).toBeLessThan(5);
  });

  it('does not open before failureThreshold is reached', async () => {
    const cb = new CircuitBreaker('not-yet-open', BASE_CONFIG);

    // Trigger failureThreshold - 1 failures
    for (let i = 0; i < BASE_CONFIG.failureThreshold - 1; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }

    expect(cb.getStatus().state).toBe('closed');
  });

  it('getStatus.failures reflects in-window failure count', async () => {
    const cb = new CircuitBreaker('failure-count', BASE_CONFIG);
    const failures = 3;
    for (let i = 0; i < failures; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }
    expect(cb.getStatus().failures).toBe(failures);
  });

  it('propagates the original error from the wrapped function', async () => {
    const cb = new CircuitBreaker('propagate-err', BASE_CONFIG);
    const originalError = new Error('specific error message');
    await expect(cb.call(fail(originalError))).rejects.toThrow('specific error message');
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Open → Half-Open transition after cooldown (acceptance criterion 2)
// ---------------------------------------------------------------------------

describe('CircuitBreaker — open → half-open after cooldownMs', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('transitions to half-open after cooldownMs elapses', async () => {
    const cb = new CircuitBreaker('cooldown-test', BASE_CONFIG);
    await openCircuit(cb);

    expect(cb.getStatus().state).toBe('open');

    // Advance time past cooldown
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    // The transition to half-open happens when .call() is invoked
    // Use a fn that succeeds so we can observe the state change
    await cb.call(succeed('probe'));

    expect(cb.getStatus().state).toBe('half-open');
  });

  it('allows exactly ONE test call through when transitioning to half-open', async () => {
    const cb = new CircuitBreaker('one-probe', BASE_CONFIG);
    await openCircuit(cb);

    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    // First call: allowed (transitions circuit to half-open)
    const probe = succeed('result');
    await expect(cb.call(probe)).resolves.toBe('result');
    expect(probe).toHaveBeenCalledOnce();
  });

  it('still throws CircuitOpenError before cooldown elapses', async () => {
    const cb = new CircuitBreaker('before-cooldown', BASE_CONFIG);
    await openCircuit(cb);

    // Advance time but not enough to trigger cooldown
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs - 1);

    await expect(cb.call(succeed('never'))).rejects.toThrow(CircuitOpenError);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Half-Open → Closed (acceptance criterion 3)
// ---------------------------------------------------------------------------

describe('CircuitBreaker — half-open → closed after successThreshold', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('closes after successThreshold consecutive successes in half-open', async () => {
    const cb = new CircuitBreaker('close-test', BASE_CONFIG);
    await openCircuit(cb);
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    // Trigger successThreshold successes (first call transitions to half-open,
    // subsequent successes accumulate toward successThreshold)
    for (let i = 0; i < BASE_CONFIG.successThreshold; i++) {
      await cb.call(succeed('ok'));
    }

    expect(cb.getStatus().state).toBe('closed');
  });

  it('does not close before successThreshold is reached', async () => {
    const cb = new CircuitBreaker('partial-close', BASE_CONFIG);
    await openCircuit(cb);
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    // Only successThreshold - 1 successes
    for (let i = 0; i < BASE_CONFIG.successThreshold - 1; i++) {
      await cb.call(succeed('ok'));
    }

    expect(cb.getStatus().state).toBe('half-open');
  });

  it('clears failure history when circuit closes from half-open', async () => {
    const cb = new CircuitBreaker('clear-failures', BASE_CONFIG);
    await openCircuit(cb);
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    for (let i = 0; i < BASE_CONFIG.successThreshold; i++) {
      await cb.call(succeed('ok'));
    }

    expect(cb.getStatus().state).toBe('closed');
    expect(cb.getStatus().failures).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Half-Open → Open (acceptance criterion 4)
// ---------------------------------------------------------------------------

describe('CircuitBreaker — half-open → open on failure', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('re-opens immediately on the first failure in half-open', async () => {
    const cb = new CircuitBreaker('reopen-test', BASE_CONFIG);
    await openCircuit(cb);
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    // Trigger half-open by allowing one probe call through (succeeds to reach half-open)
    await cb.call(succeed('probe')); // first call → half-open
    // Now fail in half-open
    await expect(cb.call(fail())).rejects.toThrow();

    expect(cb.getStatus().state).toBe('open');
  });

  it('resets the cooldown timer when re-opened from half-open', async () => {
    const cb = new CircuitBreaker('reset-cooldown', BASE_CONFIG);
    await openCircuit(cb);
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    // Enter half-open, then fail
    await cb.call(succeed('probe'));
    await expect(cb.call(fail())).rejects.toThrow();

    // Circuit is open again; the cooldown has been reset so advancing
    // by cooldownMs - 1 must NOT transition to half-open yet
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs - 1);
    await expect(cb.call(succeed('blocked'))).rejects.toThrow(CircuitOpenError);

    // Now advance past the full cooldown — should be allowed again
    vi.advanceTimersByTime(2);
    await expect(cb.call(succeed('allowed'))).resolves.toBe('allowed');
    expect(cb.getStatus().state).toBe('half-open');
  });
});

// ---------------------------------------------------------------------------
// Suite 7: Sliding window — failures outside window not counted (criterion 7)
// ---------------------------------------------------------------------------

describe('CircuitBreaker — sliding window', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('failures older than windowMs are excluded from the count', async () => {
    const cb = new CircuitBreaker('window-test', BASE_CONFIG);

    // Record failureThreshold - 1 failures near the boundary
    for (let i = 0; i < BASE_CONFIG.failureThreshold - 1; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }

    // Advance time so those failures fall outside the window
    vi.advanceTimersByTime(BASE_CONFIG.windowMs + 1);

    // One more failure should NOT open the circuit (old ones expired)
    await expect(cb.call(fail())).rejects.toThrow();

    expect(cb.getStatus().state).toBe('closed');
    expect(cb.getStatus().failures).toBe(1);
  });

  it('circuit opens when failureThreshold failures are within the window', async () => {
    const cb = new CircuitBreaker('window-open', BASE_CONFIG);

    // Spread failures inside the window: add some, advance time a bit (but stay within window)
    const partialMs = BASE_CONFIG.windowMs / 2;

    for (let i = 0; i < BASE_CONFIG.failureThreshold - 1; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }

    vi.advanceTimersByTime(partialMs); // still within windowMs

    // This failure brings in-window total to failureThreshold
    await expect(cb.call(fail())).rejects.toThrow();

    expect(cb.getStatus().state).toBe('open');
  });

  it('getStatus.failures only counts in-window failures', async () => {
    const cb = new CircuitBreaker('status-window', BASE_CONFIG);
    const firstBatch = 3;

    for (let i = 0; i < firstBatch; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }

    // Expire those failures
    vi.advanceTimersByTime(BASE_CONFIG.windowMs + 1);

    const secondBatch = 2;
    for (let i = 0; i < secondBatch; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }

    // Only the second batch should appear
    expect(cb.getStatus().failures).toBe(secondBatch);
  });
});

// ---------------------------------------------------------------------------
// Suite 8: OTel spans emitted on transitions (acceptance criterion 6)
// ---------------------------------------------------------------------------

describe('CircuitBreaker — OTel spans on state transitions', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('emits a span when transitioning from closed to open', async () => {
    const mockSpan = { setAttribute: vi.fn(), end: vi.fn() };
    const startActiveSpanSpy = vi
      .spyOn(tracer, 'startActiveSpan')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(((_name: string, fn: (span: any) => any) => fn(mockSpan)) as any);

    const cb = new CircuitBreaker('otel-open', BASE_CONFIG);
    await openCircuit(cb);

    // At least one span should have been started for the transition
    expect(startActiveSpanSpy).toHaveBeenCalled();
    const spanNames = startActiveSpanSpy.mock.calls.map(([name]) => name);
    expect(spanNames).toContain('forja.circuit.transition');
  });

  it('sets endpoint and state attributes on the transition span', async () => {
    const mockSpan = { setAttribute: vi.fn(), end: vi.fn() };
    vi.spyOn(tracer, 'startActiveSpan').mockImplementation(
      ((_name: string, fn: (span: any) => any) => fn(mockSpan)) as any,
    );

    const cb = new CircuitBreaker('otel-attrs', BASE_CONFIG);
    await openCircuit(cb);

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('forja.circuit.endpoint', 'otel-attrs');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('forja.circuit.state', 'open');
  });

  it('ends the span after the transition', async () => {
    const mockSpan = { setAttribute: vi.fn(), end: vi.fn() };
    vi.spyOn(tracer, 'startActiveSpan').mockImplementation(
      ((_name: string, fn: (span: any) => any) => fn(mockSpan)) as any,
    );

    const cb = new CircuitBreaker('otel-end', BASE_CONFIG);
    await openCircuit(cb);

    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('emits a span when transitioning from open to half-open', async () => {
    const spans: Array<{ name: string; state: string }> = [];
    const mockSpan = {
      setAttribute: vi.fn((key: string, value: string) => {
        if (key === 'forja.circuit.state') spans.push({ name: '', state: value });
      }),
      end: vi.fn(),
    };
    vi.spyOn(tracer, 'startActiveSpan').mockImplementation(
      ((_name: string, fn: (span: any) => any) => fn(mockSpan)) as any,
    );

    const cb = new CircuitBreaker('otel-half-open', BASE_CONFIG);
    await openCircuit(cb);

    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);
    await cb.call(succeed('probe'));

    const states = mockSpan.setAttribute.mock.calls
      .filter(([key]) => key === 'forja.circuit.state')
      .map(([, val]) => val);

    expect(states).toContain('half-open');
  });

  it('emits a span when transitioning from half-open to closed', async () => {
    const mockSpan = { setAttribute: vi.fn(), end: vi.fn() };
    vi.spyOn(tracer, 'startActiveSpan').mockImplementation(
      ((_name: string, fn: (span: any) => any) => fn(mockSpan)) as any,
    );

    const cb = new CircuitBreaker('otel-close', BASE_CONFIG);
    await openCircuit(cb);
    vi.advanceTimersByTime(BASE_CONFIG.cooldownMs + 1);

    for (let i = 0; i < BASE_CONFIG.successThreshold; i++) {
      await cb.call(succeed('ok'));
    }

    const states = mockSpan.setAttribute.mock.calls
      .filter(([key]) => key === 'forja.circuit.state')
      .map(([, val]) => val);

    expect(states).toContain('closed');
  });
});

// ---------------------------------------------------------------------------
// Suite 9: getCircuitBreaker registry
// ---------------------------------------------------------------------------

describe('getCircuitBreaker', () => {
  it('returns the same instance for the same endpoint', () => {
    const ep = `registry-same-${Date.now()}`;
    const a = getCircuitBreaker(ep, BASE_CONFIG);
    const b = getCircuitBreaker(ep, BASE_CONFIG);
    expect(a).toBe(b);
  });

  it('returns a CircuitBreaker with matching endpoint name', () => {
    const ep = `registry-name-${Date.now()}`;
    const cb = getCircuitBreaker(ep, BASE_CONFIG);
    expect(cb.getStatus().endpoint).toBe(ep);
  });

  it('returns a closed circuit breaker on first access', () => {
    const ep = `registry-closed-${Date.now()}`;
    const cb = getCircuitBreaker(ep, BASE_CONFIG);
    expect(cb.getStatus().state).toBe('closed');
  });

  it('ignores config on subsequent calls (uses first-registered config)', () => {
    const ep = `registry-config-${Date.now()}`;
    const first = getCircuitBreaker(ep, { ...BASE_CONFIG, failureThreshold: 2 });
    const second = getCircuitBreaker(ep, { ...BASE_CONFIG, failureThreshold: 99 });
    // Both references must be the same object
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// Suite 10: listCircuitBreakers
// ---------------------------------------------------------------------------

describe('listCircuitBreakers', () => {
  it('includes registered endpoints in the list', () => {
    const ep = `list-test-${Date.now()}`;
    getCircuitBreaker(ep, BASE_CONFIG);

    const list = listCircuitBreakers();
    const found = list.find(item => item.endpoint === ep);
    expect(found).toBeDefined();
  });

  it('returns correct { endpoint, state, failures } shape', () => {
    const ep = `list-shape-${Date.now()}`;
    getCircuitBreaker(ep, BASE_CONFIG);

    const list = listCircuitBreakers();
    const item = list.find(i => i.endpoint === ep)!;

    expect(item).toHaveProperty('endpoint', ep);
    expect(item).toHaveProperty('state', 'closed');
    expect(item).toHaveProperty('failures', 0);
  });
});

// ---------------------------------------------------------------------------
// Suite 11: Custom config overrides
// ---------------------------------------------------------------------------

describe('CircuitBreaker — custom config', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('respects custom failureThreshold of 2', async () => {
    const config: CircuitBreakerConfig = { ...BASE_CONFIG, failureThreshold: 2 };
    const cb = new CircuitBreaker('custom-threshold', config);

    await expect(cb.call(fail())).rejects.toThrow();
    expect(cb.getStatus().state).toBe('closed');

    await expect(cb.call(fail())).rejects.toThrow();
    expect(cb.getStatus().state).toBe('open');
  });

  it('respects custom successThreshold of 1 for quick close', async () => {
    const config: CircuitBreakerConfig = { ...BASE_CONFIG, failureThreshold: 2, successThreshold: 1 };
    const cb = new CircuitBreaker('custom-success', config);

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }
    vi.advanceTimersByTime(config.cooldownMs + 1);

    // One success in half-open should close
    await cb.call(succeed('ok'));
    expect(cb.getStatus().state).toBe('closed');
  });

  it('respects a short windowMs — failures outside window do not count', async () => {
    const config: CircuitBreakerConfig = { ...BASE_CONFIG, windowMs: 1_000, failureThreshold: 3 };
    const cb = new CircuitBreaker('short-window', config);

    // Two failures within the window
    await expect(cb.call(fail())).rejects.toThrow();
    await expect(cb.call(fail())).rejects.toThrow();

    // Expire both failures
    vi.advanceTimersByTime(1_001);

    // Two more failures — still below threshold (expired ones don't count)
    await expect(cb.call(fail())).rejects.toThrow();
    await expect(cb.call(fail())).rejects.toThrow();

    expect(cb.getStatus().state).toBe('closed');
    expect(cb.getStatus().failures).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite 12: Concurrent / mixed success and failure
// ---------------------------------------------------------------------------

describe('CircuitBreaker — mixed calls', () => {
  it('does not count successful calls as failures', async () => {
    const cb = new CircuitBreaker('mixed-success', BASE_CONFIG);

    for (let i = 0; i < BASE_CONFIG.failureThreshold - 1; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }

    // A success should not contribute to the failure count
    await cb.call(succeed('ok'));

    expect(cb.getStatus().state).toBe('closed');
    expect(cb.getStatus().failures).toBe(BASE_CONFIG.failureThreshold - 1);
  });

  it('resets consecutiveSuccesses counter when a failure interrupts half-open recovery', async () => {
    vi.useFakeTimers();
    const config: CircuitBreakerConfig = { ...BASE_CONFIG, successThreshold: 3, failureThreshold: 2 };
    const cb = new CircuitBreaker('interrupted-recovery', config);

    // Open circuit
    for (let i = 0; i < 2; i++) {
      await expect(cb.call(fail())).rejects.toThrow();
    }
    vi.advanceTimersByTime(config.cooldownMs + 1);

    // Enter half-open: 1 success, then a failure (re-opens)
    await cb.call(succeed('s1'));          // half-open, consecutiveSuccesses=1
    await expect(cb.call(fail())).rejects.toThrow(); // re-opens

    // Cooldown again
    vi.advanceTimersByTime(config.cooldownMs + 1);

    // Need full successThreshold successes again to close
    for (let i = 0; i < config.successThreshold; i++) {
      await cb.call(succeed('ok'));
    }

    expect(cb.getStatus().state).toBe('closed');
    vi.useRealTimers();
  });
});
