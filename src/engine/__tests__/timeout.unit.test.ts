import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setPhaseTimeout, isTimedOut } from '../timeout.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENV_KEY = 'FORJA_PHASE_TIMEOUT_AT';

function clearTimeoutEnv(): void {
  delete process.env[ENV_KEY];
}

// ---------------------------------------------------------------------------
// setPhaseTimeout
// ---------------------------------------------------------------------------

describe('setPhaseTimeout', () => {
  beforeEach(() => clearTimeoutEnv());
  afterEach(() => clearTimeoutEnv());

  it('sets FORJA_PHASE_TIMEOUT_AT to a future ISO8601 timestamp', () => {
    const before = Date.now();
    setPhaseTimeout('dev', 60);
    const after = Date.now();

    const raw = process.env[ENV_KEY];
    expect(raw).toBeDefined();

    const deadline = new Date(raw!).getTime();
    expect(isNaN(deadline)).toBe(false);

    // deadline should be approximately `before + 60000` ms in the future
    expect(deadline).toBeGreaterThanOrEqual(before + 60_000);
    expect(deadline).toBeLessThanOrEqual(after + 60_000);
  });

  it('stores the value as a valid ISO8601 string', () => {
    setPhaseTimeout('test', 300);
    const raw = process.env[ENV_KEY]!;
    expect(raw).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/);
  });

  it('does nothing when seconds is 0 (guard against non-positive values)', () => {
    delete process.env[ENV_KEY];
    setPhaseTimeout('pr', 0);
    expect(process.env[ENV_KEY]).toBeUndefined();
  });

  it('overrides a previously set timeout when called again', () => {
    setPhaseTimeout('dev', 600);
    const first = process.env[ENV_KEY];

    setPhaseTimeout('dev', 30);
    const second = process.env[ENV_KEY];

    expect(second).not.toBe(first);
    expect(new Date(second!).getTime()).toBeLessThan(new Date(first!).getTime());
  });
});

// ---------------------------------------------------------------------------
// isTimedOut
// ---------------------------------------------------------------------------

describe('isTimedOut', () => {
  beforeEach(() => clearTimeoutEnv());
  afterEach(() => clearTimeoutEnv());

  it('returns false when FORJA_PHASE_TIMEOUT_AT is not set', () => {
    expect(isTimedOut()).toBe(false);
  });

  it('returns false when deadline is in the future', () => {
    process.env[ENV_KEY] = new Date(Date.now() + 60_000).toISOString();
    expect(isTimedOut()).toBe(false);
  });

  it('returns true when deadline is in the past', () => {
    process.env[ENV_KEY] = new Date(Date.now() - 1_000).toISOString();
    expect(isTimedOut()).toBe(true);
  });

  it('returns false for an invalid ISO8601 string (random text)', () => {
    process.env[ENV_KEY] = 'not-a-date';
    expect(isTimedOut()).toBe(false);
  });

  it('returns false for a partial ISO8601 string missing timezone', () => {
    // e.g. "2024-01-01T00:00:00" — fails the ISO8601_RE which requires timezone
    process.env[ENV_KEY] = '2024-01-01T00:00:00';
    expect(isTimedOut()).toBe(false);
  });

  it('returns false for an empty string', () => {
    process.env[ENV_KEY] = '';
    expect(isTimedOut()).toBe(false);
  });

  it('returns false when env is set to "undefined" as a string', () => {
    process.env[ENV_KEY] = 'undefined';
    expect(isTimedOut()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PhaseTimeoutsSchema
// ---------------------------------------------------------------------------

import { PhaseTimeoutsSchema } from '../../schemas/config.js';

describe('PhaseTimeoutsSchema', () => {
  it('parses an empty object and returns all 7 default timeouts', () => {
    const result = PhaseTimeoutsSchema.parse({});
    expect(result).toEqual({
      dev: 600,
      test: 300,
      perf: 180,
      security: 180,
      review: 180,
      homolog: 60,
      pr: 120,
    });
  });

  it('allows overriding individual phase timeouts', () => {
    const result = PhaseTimeoutsSchema.parse({ dev: 900, test: 450 });
    expect(result.dev).toBe(900);
    expect(result.test).toBe(450);
    // others fall back to defaults
    expect(result.perf).toBe(180);
    expect(result.homolog).toBe(60);
  });

  it('rejects non-positive integers (0)', () => {
    expect(() => PhaseTimeoutsSchema.parse({ dev: 0 })).toThrow();
  });

  it('rejects negative integers', () => {
    expect(() => PhaseTimeoutsSchema.parse({ dev: -1 })).toThrow();
  });

  it('rejects floats', () => {
    expect(() => PhaseTimeoutsSchema.parse({ dev: 1.5 })).toThrow();
  });

  it('rejects string values', () => {
    expect(() => PhaseTimeoutsSchema.parse({ dev: '600' })).toThrow();
  });

  it('has exactly 7 keys', () => {
    const result = PhaseTimeoutsSchema.parse({});
    expect(Object.keys(result)).toHaveLength(7);
  });

  it('includes all expected phase keys', () => {
    const result = PhaseTimeoutsSchema.parse({});
    const keys = Object.keys(result);
    expect(keys).toContain('dev');
    expect(keys).toContain('test');
    expect(keys).toContain('perf');
    expect(keys).toContain('security');
    expect(keys).toContain('review');
    expect(keys).toContain('homolog');
    expect(keys).toContain('pr');
  });
});
