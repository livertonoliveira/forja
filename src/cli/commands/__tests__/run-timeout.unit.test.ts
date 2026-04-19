/**
 * Unit tests for timeout-related logic in `src/cli/commands/run.ts` — MOB-1010.
 *
 * Covers:
 *   - --timeout-phase CLI option presence on runCommand
 *   - Timeout override parsing logic (phase:seconds format)
 *   - PhaseTimeoutsSchema defaults applied when no override given
 *   - Edge cases: missing colon, non-positive seconds, NaN
 */

import { describe, it, expect } from 'vitest';
import { runCommand, PIPELINE_SEQUENCE } from '../run.js';
import { PhaseTimeoutsSchema } from '../../../schemas/config.js';

// ---------------------------------------------------------------------------
// Helpers — mirrors the parsing logic in run.ts action handler
// ---------------------------------------------------------------------------

function parseTimeoutPhase(raw: string): Partial<Record<string, number>> {
  const overrides: Partial<Record<string, number>> = {};
  const colonIdx = raw.indexOf(':');
  if (colonIdx !== -1) {
    const phaseKey = raw.slice(0, colonIdx);
    const seconds = parseInt(raw.slice(colonIdx + 1), 10);
    if (!isNaN(seconds) && seconds > 0) {
      overrides[phaseKey] = seconds;
    }
  }
  return overrides;
}

function buildEffectiveTimeouts(timeoutPhase?: string): Record<string, number> {
  const overrides = timeoutPhase ? parseTimeoutPhase(timeoutPhase) : {};
  const defaultTimeouts = PhaseTimeoutsSchema.parse({});
  return { ...defaultTimeouts, ...overrides };
}

// ---------------------------------------------------------------------------
// runCommand option presence
// ---------------------------------------------------------------------------

describe('runCommand — --timeout-phase option', () => {
  it('registers the --timeout-phase option', () => {
    const flags = runCommand.options.map((o) => o.flags);
    expect(flags.some((f) => f.includes('--timeout-phase'))).toBe(true);
  });

  it('--timeout-phase option description mentions phase:seconds', () => {
    const opt = runCommand.options.find((o) => o.flags.includes('--timeout-phase'));
    expect(opt).toBeDefined();
    // The option should carry a description or argument hint indicating usage
    expect(opt!.flags).toContain('<phase:seconds>');
  });
});

// ---------------------------------------------------------------------------
// Timeout parsing — valid input
// ---------------------------------------------------------------------------

describe('parseTimeoutPhase — valid input', () => {
  it('parses "dev:900" correctly: phase=dev, seconds=900', () => {
    const result = parseTimeoutPhase('dev:900');
    expect(result).toEqual({ dev: 900 });
  });

  it('parses "test:450" correctly', () => {
    const result = parseTimeoutPhase('test:450');
    expect(result).toEqual({ test: 450 });
  });

  it('parses "pr:60" correctly', () => {
    const result = parseTimeoutPhase('pr:60');
    expect(result).toEqual({ pr: 60 });
  });

  it('parses "homolog:1" (minimum positive) correctly', () => {
    const result = parseTimeoutPhase('homolog:1');
    expect(result).toEqual({ homolog: 1 });
  });
});

// ---------------------------------------------------------------------------
// Timeout parsing — invalid input ignored gracefully
// ---------------------------------------------------------------------------

describe('parseTimeoutPhase — invalid input ignored gracefully', () => {
  it('returns empty object when input has no colon', () => {
    const result = parseTimeoutPhase('invalidnocoion');
    expect(result).toEqual({});
  });

  it('returns empty object for "dev:0" (non-positive)', () => {
    const result = parseTimeoutPhase('dev:0');
    expect(result).toEqual({});
  });

  it('returns empty object for "dev:-1" (negative)', () => {
    const result = parseTimeoutPhase('dev:-1');
    expect(result).toEqual({});
  });

  it('returns empty object for "dev:abc" (non-numeric seconds)', () => {
    const result = parseTimeoutPhase('dev:abc');
    expect(result).toEqual({});
  });

  it('returns empty object for an empty string', () => {
    const result = parseTimeoutPhase('');
    expect(result).toEqual({});
  });

  it('returns empty object for ":900" (empty phase key)', () => {
    // Phase key is empty string — still stored but effectively invalid key
    // The function only checks that seconds > 0; an empty phase key is unusual
    // but does not crash — document actual behaviour
    const result = parseTimeoutPhase(':900');
    // Empty phase key → stored as '' key with value 900
    expect(result['']).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// Effective timeouts: defaults merged with overrides
// ---------------------------------------------------------------------------

describe('buildEffectiveTimeouts — defaults and overrides', () => {
  it('returns all 7 default timeouts when no override given', () => {
    const effective = buildEffectiveTimeouts(undefined);
    expect(effective).toEqual({
      dev: 600,
      test: 300,
      perf: 180,
      security: 180,
      review: 180,
      homolog: 60,
      pr: 120,
    });
  });

  it('overrides dev timeout to 900 when "--timeout-phase dev:900"', () => {
    const effective = buildEffectiveTimeouts('dev:900');
    expect(effective.dev).toBe(900);
    // all other phases unchanged
    expect(effective.test).toBe(300);
    expect(effective.perf).toBe(180);
    expect(effective.pr).toBe(120);
  });

  it('does not alter any phase when invalid --timeout-phase (no colon)', () => {
    const effective = buildEffectiveTimeouts('invalidinput');
    const defaults = PhaseTimeoutsSchema.parse({});
    expect(effective).toEqual(defaults);
  });

  it('does not alter any phase when --timeout-phase dev:0', () => {
    const effective = buildEffectiveTimeouts('dev:0');
    expect(effective.dev).toBe(600); // default preserved
  });
});

// ---------------------------------------------------------------------------
// PIPELINE_SEQUENCE — all phases have a default timeout
// ---------------------------------------------------------------------------

describe('PIPELINE_SEQUENCE — all pipeline phases have a default timeout', () => {
  it('every phase in PIPELINE_SEQUENCE has a positive default timeout', () => {
    const defaults = PhaseTimeoutsSchema.parse({});
    for (const phase of PIPELINE_SEQUENCE) {
      if (phase === 'done') continue; // 'done' is terminal, no timeout needed
      const timeout = (defaults as Record<string, number>)[phase];
      expect(typeof timeout).toBe('number');
      expect(timeout).toBeGreaterThan(0);
    }
  });
});
