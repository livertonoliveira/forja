import { describe, it, expect } from 'vitest';
import { PREDICATES_REGISTRY } from '../predicates.js';
import type { EvaluationContext } from '../context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fullCtx: EvaluationContext = {
  coverage: { delta: -0.03, absolute: 0.78 },
  diff: {
    filesChanged: 5,
    linesChanged: 120,
    touched: [
      'src/auth/login.ts',
      'src/auth/middleware/guard.ts',
      'src/utils/helpers.ts',
      'src/authz/check.ts',
      '',
    ],
  },
  time: { phaseDurationMs: 60000, phases: { test: 90000, dev: 30000 } },
  cost: { usd: 2.5 },
  findings: {
    countBySeverity: { critical: 2, high: 5, medium: 3, low: 10 },
  },
};

const emptyCtx: EvaluationContext = {};

function strArg(v: string) {
  return { kind: 'str' as const, value: v };
}

// ---------------------------------------------------------------------------
// coverage.delta
// ---------------------------------------------------------------------------

describe('coverage.delta', () => {
  const fn = PREDICATES_REGISTRY['coverage.delta'];

  it('returns the delta fraction from context', () => {
    expect(fn(fullCtx, [])).toBe(-0.03);
  });

  it('returns a positive delta when coverage improved', () => {
    const ctx: EvaluationContext = { coverage: { delta: 0.05, absolute: 0.9 } };
    expect(fn(ctx, [])).toBe(0.05);
  });

  it('returns undefined when ctx.coverage is missing', () => {
    expect(fn(emptyCtx, [])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// coverage.absolute
// ---------------------------------------------------------------------------

describe('coverage.absolute', () => {
  const fn = PREDICATES_REGISTRY['coverage.absolute'];

  it('returns the absolute coverage fraction from context', () => {
    expect(fn(fullCtx, [])).toBe(0.78);
  });

  it('returns 0 when coverage is zero', () => {
    const ctx: EvaluationContext = { coverage: { delta: 0, absolute: 0 } };
    expect(fn(ctx, [])).toBe(0);
  });

  it('returns undefined when ctx.coverage is missing', () => {
    expect(fn(emptyCtx, [])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// diff.filesChanged
// ---------------------------------------------------------------------------

describe('diff.filesChanged', () => {
  const fn = PREDICATES_REGISTRY['diff.filesChanged'];

  it('returns the number of files changed', () => {
    expect(fn(fullCtx, [])).toBe(5);
  });

  it('returns 0 when no files changed', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 0, linesChanged: 0, touched: [] },
    };
    expect(fn(ctx, [])).toBe(0);
  });

  it('returns undefined when ctx.diff is missing', () => {
    expect(fn(emptyCtx, [])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// diff.linesChanged
// ---------------------------------------------------------------------------

describe('diff.linesChanged', () => {
  const fn = PREDICATES_REGISTRY['diff.linesChanged'];

  it('returns the number of lines changed', () => {
    expect(fn(fullCtx, [])).toBe(120);
  });

  it('returns a large value for big diffs', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 1, linesChanged: 10000, touched: [] },
    };
    expect(fn(ctx, [])).toBe(10000);
  });

  it('returns undefined when ctx.diff is missing', () => {
    expect(fn(emptyCtx, [])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// touched.matches
// ---------------------------------------------------------------------------

describe('touched.matches', () => {
  const fn = PREDICATES_REGISTRY['touched.matches'];
  const pattern = 'src/auth/**';

  it('matches src/auth/login.ts', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 1, linesChanged: 1, touched: ['src/auth/login.ts'] },
    };
    expect(fn(ctx, [strArg(pattern)])).toBe(true);
  });

  it('matches src/auth/middleware/guard.ts (nested path)', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 1, linesChanged: 1, touched: ['src/auth/middleware/guard.ts'] },
    };
    expect(fn(ctx, [strArg(pattern)])).toBe(true);
  });

  it('does NOT match src/utils/helpers.ts', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 1, linesChanged: 1, touched: ['src/utils/helpers.ts'] },
    };
    expect(fn(ctx, [strArg(pattern)])).toBe(false);
  });

  it('does NOT match src/authz/check.ts (authz ≠ auth)', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 1, linesChanged: 1, touched: ['src/authz/check.ts'] },
    };
    expect(fn(ctx, [strArg(pattern)])).toBe(false);
  });

  it('does NOT match an empty string path', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 1, linesChanged: 1, touched: [''] },
    };
    expect(fn(ctx, [strArg(pattern)])).toBe(false);
  });

  it('returns true when at least one file in a mixed list matches', () => {
    expect(fn(fullCtx, [strArg(pattern)])).toBe(true);
  });

  it('returns undefined when ctx.diff is missing', () => {
    expect(fn(emptyCtx, [strArg(pattern)])).toBeUndefined();
  });

  it('returns undefined when no args are provided', () => {
    expect(fn(fullCtx, [])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// time.phaseDurationMs
// ---------------------------------------------------------------------------

describe('time.phaseDurationMs', () => {
  const fn = PREDICATES_REGISTRY['time.phaseDurationMs'];

  it('returns the duration of a named phase', () => {
    expect(fn(fullCtx, [strArg('test')])).toBe(90000);
  });

  it('returns scalar phaseDurationMs when no args given', () => {
    expect(fn(fullCtx, [])).toBe(60000);
  });

  it('returns undefined for an unknown phase name', () => {
    expect(fn(fullCtx, [strArg('nonexistent')])).toBeUndefined();
  });

  it('returns undefined when ctx.time is missing', () => {
    expect(fn(emptyCtx, [strArg('test')])).toBeUndefined();
  });

  it('returns dev phase duration correctly', () => {
    expect(fn(fullCtx, [strArg('dev')])).toBe(30000);
  });
});

// ---------------------------------------------------------------------------
// cost.usd
// ---------------------------------------------------------------------------

describe('cost.usd', () => {
  const fn = PREDICATES_REGISTRY['cost.usd'];

  it('returns the total cost in USD', () => {
    expect(fn(fullCtx, [])).toBe(2.5);
  });

  it('returns 0 when cost is zero', () => {
    const ctx: EvaluationContext = { cost: { usd: 0 } };
    expect(fn(ctx, [])).toBe(0);
  });

  it('returns undefined when ctx.cost is missing', () => {
    expect(fn(emptyCtx, [])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// findings.countBySeverity
// ---------------------------------------------------------------------------

describe('findings.countBySeverity', () => {
  const fn = PREDICATES_REGISTRY['findings.countBySeverity'];

  it('returns the count for critical severity', () => {
    expect(fn(fullCtx, [strArg('critical')])).toBe(2);
  });

  it('returns the count for high severity', () => {
    expect(fn(fullCtx, [strArg('high')])).toBe(5);
  });

  it('returns the count for medium severity', () => {
    expect(fn(fullCtx, [strArg('medium')])).toBe(3);
  });

  it('returns the count for low severity', () => {
    expect(fn(fullCtx, [strArg('low')])).toBe(10);
  });

  it('returns undefined when ctx.findings is missing', () => {
    expect(fn(emptyCtx, [strArg('critical')])).toBeUndefined();
  });

  it('returns undefined when no args are provided', () => {
    expect(fn(fullCtx, [])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Registry lookup
// ---------------------------------------------------------------------------

describe('PREDICATES_REGISTRY lookup', () => {
  it('unknown predicate key is not in registry', () => {
    expect(PREDICATES_REGISTRY['nonexistent.predicate']).toBeUndefined();
  });

  it('all 8 canonical predicates are present in the registry', () => {
    const expected = [
      'coverage.delta',
      'coverage.absolute',
      'diff.filesChanged',
      'diff.linesChanged',
      'touched.matches',
      'time.phaseDurationMs',
      'cost.usd',
      'findings.countBySeverity',
    ];
    for (const key of expected) {
      expect(typeof PREDICATES_REGISTRY[key]).toBe('function');
    }
  });
});
