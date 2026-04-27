import { describe, it, expect } from 'vitest';
import { parseExpr } from '../parser.js';
import { evaluate } from '../evaluator.js';
import type { EvaluationContext } from '../context.js';
import type { PolicyAST } from '../ast.js';

function policy(name: string, when: string, then: string[]): PolicyAST {
  return { version: '1', gates: [{ name, when: parseExpr(when), then }] };
}

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

describe('evaluate — comparison operators', () => {
  it('coverage.delta() < -5 with delta=-7 fires fail gate → verdict fail', () => {
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 80 } };
    const result = evaluate(policy('cov-drop', 'coverage.delta() < -5', ['fail']), ctx);
    expect(result.verdict).toBe('fail');
  });

  it('coverage.delta() < -5 with delta=-3 does not fire → verdict pass', () => {
    const ctx: EvaluationContext = { coverage: { delta: -3, absolute: 80 } };
    const result = evaluate(policy('cov-drop', 'coverage.delta() < -5', ['fail']), ctx);
    expect(result.verdict).toBe('pass');
  });

  it('coverage.delta() > 0 with delta=5 fires warn gate → verdict warn', () => {
    const ctx: EvaluationContext = { coverage: { delta: 5, absolute: 90 } };
    const result = evaluate(policy('cov-up', 'coverage.delta() > 0', ['warn']), ctx);
    expect(result.verdict).toBe('warn');
  });

  it('coverage.delta() >= 0 with delta=0 fires gate', () => {
    const ctx: EvaluationContext = { coverage: { delta: 0, absolute: 80 } };
    const result = evaluate(policy('cov-gte', 'coverage.delta() >= 0', ['warn']), ctx);
    expect(result.verdict).toBe('warn');
  });

  it('coverage.delta() <= -10 with delta=-10 fires gate', () => {
    const ctx: EvaluationContext = { coverage: { delta: -10, absolute: 70 } };
    const result = evaluate(policy('cov-lte', 'coverage.delta() <= -10', ['fail']), ctx);
    expect(result.verdict).toBe('fail');
  });

  it('coverage.delta() == -5 with delta=-5 fires gate (string equality)', () => {
    const ctx: EvaluationContext = { coverage: { delta: -5, absolute: 75 } };
    const result = evaluate(policy('cov-eq', 'coverage.delta() == -5', ['fail']), ctx);
    expect(result.verdict).toBe('fail');
  });

  it('coverage.delta() != 0 with delta=5 fires gate', () => {
    const ctx: EvaluationContext = { coverage: { delta: 5, absolute: 85 } };
    const result = evaluate(policy('cov-neq', 'coverage.delta() != 0', ['warn']), ctx);
    expect(result.verdict).toBe('warn');
  });

  it('diff.filesChanged() > 10 with filesChanged=15 → verdict fail', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 15, linesChanged: 100, touched: [] } };
    const result = evaluate(policy('too-many-files', 'diff.filesChanged() > 10', ['fail']), ctx);
    expect(result.verdict).toBe('fail');
  });

  it('diff.linesChanged() > 500 with linesChanged=200 does not fire → verdict pass', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 5, linesChanged: 200, touched: [] } };
    const result = evaluate(policy('big-diff', 'diff.linesChanged() > 500', ['fail']), ctx);
    expect(result.verdict).toBe('pass');
  });

  it('cost.usd() > 1 with cost.usd=0.5 does not fire → verdict pass', () => {
    const ctx: EvaluationContext = { cost: { usd: 0.5 } };
    const result = evaluate(policy('cost-gate', 'cost.usd() > 1', ['fail']), ctx);
    expect(result.verdict).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

describe('evaluate — predicate: matches', () => {
  it('diff.touched.matches("src/auth/**") with matching file → fires', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 1, linesChanged: 10, touched: ['src/auth/login.ts'] } };
    const result = evaluate(policy('auth-touched', 'diff.touched.matches("src/auth/**")', ['warn']), ctx);
    expect(result.verdict).toBe('warn');
  });

  it('diff.touched.matches("src/auth/**") with non-matching file → does not fire', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 1, linesChanged: 10, touched: ['src/utils/foo.ts'] } };
    const result = evaluate(policy('auth-touched', 'diff.touched.matches("src/auth/**")', ['warn']), ctx);
    expect(result.verdict).toBe('pass');
  });

  it('diff.touched.matches("**/*.ts") with multiple matching files → fires', () => {
    const ctx: EvaluationContext = {
      diff: { filesChanged: 2, linesChanged: 20, touched: ['src/foo.ts', 'lib/bar.ts'] },
    };
    const result = evaluate(policy('ts-touched', 'diff.touched.matches("**/*.ts")', ['warn']), ctx);
    expect(result.verdict).toBe('warn');
  });

  it('diff.touched.matches("src/auth/**") with empty touched array → does not fire', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 0, linesChanged: 0, touched: [] } };
    const result = evaluate(policy('auth-touched', 'diff.touched.matches("src/auth/**")', ['warn']), ctx);
    expect(result.verdict).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// Boolean operators
// ---------------------------------------------------------------------------

describe('evaluate — boolean operators', () => {
  it('AND: both conditions true → fires', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -7, absolute: 70 },
      diff: { filesChanged: 15, linesChanged: 100, touched: [] },
    };
    const result = evaluate(
      policy('combined', 'coverage.delta() < -5 and diff.filesChanged() > 10', ['fail']),
      ctx,
    );
    expect(result.verdict).toBe('fail');
  });

  it('AND: only first condition true → does not fire', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -7, absolute: 70 },
      diff: { filesChanged: 3, linesChanged: 30, touched: [] },
    };
    const result = evaluate(
      policy('combined', 'coverage.delta() < -5 and diff.filesChanged() > 10', ['fail']),
      ctx,
    );
    expect(result.verdict).toBe('pass');
  });

  it('OR: first condition true → fires', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -7, absolute: 70 },
      diff: { filesChanged: 3, linesChanged: 30, touched: [] },
    };
    const result = evaluate(
      policy('combined', 'coverage.delta() < -5 or diff.filesChanged() > 10', ['fail']),
      ctx,
    );
    expect(result.verdict).toBe('fail');
  });

  it('OR: second condition true → fires', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -3, absolute: 80 },
      diff: { filesChanged: 15, linesChanged: 100, touched: [] },
    };
    const result = evaluate(
      policy('combined', 'coverage.delta() < -5 or diff.filesChanged() > 10', ['fail']),
      ctx,
    );
    expect(result.verdict).toBe('fail');
  });

  it('OR: neither condition true → does not fire', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -3, absolute: 80 },
      diff: { filesChanged: 3, linesChanged: 30, touched: [] },
    };
    const result = evaluate(
      policy('combined', 'coverage.delta() < -5 or diff.filesChanged() > 10', ['fail']),
      ctx,
    );
    expect(result.verdict).toBe('pass');
  });

  it('NOT: inner comparison false → not fires (true)', () => {
    const ctx: EvaluationContext = { coverage: { delta: -3, absolute: 80 } };
    const result = evaluate(policy('not-gate', 'not coverage.delta() < -5', ['warn']), ctx);
    expect(result.verdict).toBe('warn');
  });

  it('NOT: inner comparison true → not does not fire (false)', () => {
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 70 } };
    const result = evaluate(policy('not-gate', 'not coverage.delta() < -5', ['warn']), ctx);
    expect(result.verdict).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// Nested / complex expressions
// ---------------------------------------------------------------------------

describe('evaluate — nested and complex expressions', () => {
  it('parenthesized OR + AND: outer AND false because second condition fails', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -7, absolute: 70 },
      cost: { usd: 0.5 },
      diff: { filesChanged: 3, linesChanged: 30, touched: [] },
    };
    // (coverage.delta() < -5 or cost.usd() > 10) = true OR false = true
    // and diff.filesChanged() > 5 = false
    // overall = false → does not fire
    const result = evaluate(
      policy(
        'complex',
        '(coverage.delta() < -5 or cost.usd() > 10) and diff.filesChanged() > 5',
        ['fail'],
      ),
      ctx,
    );
    expect(result.verdict).toBe('pass');
  });

  it('parenthesized OR + AND: outer AND true when both branches hold', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -7, absolute: 70 },
      cost: { usd: 0.5 },
      diff: { filesChanged: 8, linesChanged: 80, touched: [] },
    };
    // (coverage.delta() < -5 or cost.usd() > 10) = true
    // and diff.filesChanged() > 5 = true → fires
    const result = evaluate(
      policy(
        'complex',
        '(coverage.delta() < -5 or cost.usd() > 10) and diff.filesChanged() > 5',
        ['fail'],
      ),
      ctx,
    );
    expect(result.verdict).toBe('fail');
  });

  it('multiple gates: first passes, second fails → overall fail', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -3, absolute: 80 },
      diff: { filesChanged: 15, linesChanged: 100, touched: [] },
    };
    const p: PolicyAST = {
      version: '1',
      gates: [
        { name: 'gate-1', when: parseExpr('coverage.delta() < -5'), then: ['fail'] },
        { name: 'gate-2', when: parseExpr('diff.filesChanged() > 10'), then: ['fail'] },
      ],
    };
    const result = evaluate(p, ctx);
    expect(result.verdict).toBe('fail');
  });

  it('multiple gates: first warns, second passes → overall warn', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -7, absolute: 70 },
      diff: { filesChanged: 3, linesChanged: 30, touched: [] },
    };
    const p: PolicyAST = {
      version: '1',
      gates: [
        { name: 'gate-warn', when: parseExpr('coverage.delta() < -5'), then: ['warn'] },
        { name: 'gate-pass', when: parseExpr('diff.filesChanged() > 10'), then: ['fail'] },
      ],
    };
    const result = evaluate(p, ctx);
    expect(result.verdict).toBe('warn');
  });

  it('empty gates array → verdict pass, justification empty string, metrics empty', () => {
    const p: PolicyAST = { version: '1', gates: [] };
    const result = evaluate(p, {});
    expect(result.verdict).toBe('pass');
    expect(result.justification).toBe('');
    expect(result.metrics).toEqual({});
  });

  it('gate with action "pass" (not fail/warn) → verdict remains pass even if gate fires', () => {
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 70 } };
    const result = evaluate(policy('noop-gate', 'coverage.delta() < -5', ['pass']), ctx);
    expect(result.verdict).toBe('pass');
  });

  it('findings.countBySeverity.critical() > 0 with critical=3 → fires fail', () => {
    const ctx: EvaluationContext = {
      findings: { countBySeverity: { critical: 3, high: 0, medium: 0, low: 0 } },
    };
    const result = evaluate(
      policy('critical-findings', 'findings.countBySeverity.critical() > 0', ['fail']),
      ctx,
    );
    expect(result.verdict).toBe('fail');
  });

  it('time.phaseDurationMs() > 30000 with phaseDurationMs=60000 → fires', () => {
    const ctx: EvaluationContext = { time: { phaseDurationMs: 60000 } };
    const result = evaluate(policy('slow-phase', 'time.phaseDurationMs() > 30000', ['warn']), ctx);
    expect(result.verdict).toBe('warn');
  });

  it('coverage.absolute() < 80 with absolute=75 → fires', () => {
    const ctx: EvaluationContext = { coverage: { delta: 0, absolute: 75 } };
    const result = evaluate(policy('low-coverage', 'coverage.absolute() < 80', ['fail']), ctx);
    expect(result.verdict).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Null / undefined metric cases
// ---------------------------------------------------------------------------

describe('evaluate — missing metrics', () => {
  it('coverage.delta() with no coverage in ctx → verdict warn, justification includes "unavailable"', () => {
    const result = evaluate(policy('cov-missing', 'coverage.delta() < -5', ['fail']), {});
    expect(result.verdict).toBe('warn');
    expect(result.justification).toContain('unavailable');
  });

  it('coverage.delta() < -5 with empty ctx → verdict warn (missing metric)', () => {
    const result = evaluate(policy('cov-missing', 'coverage.delta() < -5', ['fail']), {});
    expect(result.verdict).toBe('warn');
  });

  it('diff.touched.matches("src/auth/**") with no diff in ctx → verdict warn', () => {
    const result = evaluate(policy('diff-missing', 'diff.touched.matches("src/auth/**")', ['warn']), {});
    expect(result.verdict).toBe('warn');
  });

  it('findings.countBySeverity.critical() > 0 with no findings in ctx → verdict warn', () => {
    const result = evaluate(
      policy('findings-missing', 'findings.countBySeverity.critical() > 0', ['fail']),
      {},
    );
    expect(result.verdict).toBe('warn');
  });

  it('one gate has missing metric (warn), another fires with fail → overall fail', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 15, linesChanged: 100, touched: [] } };
    const p: PolicyAST = {
      version: '1',
      gates: [
        { name: 'missing-metric-gate', when: parseExpr('coverage.delta() < -5'), then: ['fail'] },
        { name: 'failing-gate', when: parseExpr('diff.filesChanged() > 10'), then: ['fail'] },
      ],
    };
    const result = evaluate(p, ctx);
    expect(result.verdict).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Justification content
// ---------------------------------------------------------------------------

describe('evaluate — justification content', () => {
  it('justification includes gate name like [gate-name]', () => {
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 70 } };
    const result = evaluate(policy('my-gate', 'coverage.delta() < -5', ['fail']), ctx);
    expect(result.justification).toContain('[my-gate]');
  });

  it('justification includes the resolved metric value', () => {
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 70 } };
    const result = evaluate(policy('cov-gate', 'coverage.delta() < -5', ['fail']), ctx);
    expect(result.justification).toContain('-7');
  });

  it('justification includes the comparison result like (-7 < -5) = true', () => {
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 70 } };
    const result = evaluate(policy('cov-gate', 'coverage.delta() < -5', ['fail']), ctx);
    expect(result.justification).toContain('true');
    expect(result.justification).toContain('-7');
    expect(result.justification).toContain('-5');
  });

  it('justification for "is" predicate contains .is("value") = true/false', () => {
    // Use a raw PredicateCall for "is" predicate by building a policy with it
    // The path is: coverage.delta.is("foo") on a string field, but since is does a
    // string equality, we test it via a call node directly
    const p: PolicyAST = {
      version: '1',
      gates: [
        {
          name: 'is-gate',
          when: parseExpr('coverage.delta.is("-7")'),
          then: ['warn'],
        },
      ],
    };
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 70 } };
    const result = evaluate(p, ctx);
    // The trace format is: coverage.delta.is(-7) = true (no quotes around the argument)
    expect(result.justification).toMatch(/\.is\(-7\) = true/);
  });

  it('justification for "matches" predicate contains .matches("pattern") = true/false', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 1, linesChanged: 5, touched: ['src/auth/login.ts'] } };
    const result = evaluate(
      policy('matches-gate', 'diff.touched.matches("src/auth/**")', ['warn']),
      ctx,
    );
    expect(result.justification).toMatch(/\.matches\("src\/auth\/\*\*"\) = true/);
  });

  it('justification includes gate name and metric path for missing metric', () => {
    const result = evaluate(policy('missing-gate', 'coverage.delta() < -5', ['fail']), {});
    expect(result.justification).toContain('[missing-gate]');
    expect(result.justification).toContain('coverage.delta');
  });
});

// ---------------------------------------------------------------------------
// Metrics tracking
// ---------------------------------------------------------------------------

describe('evaluate — metrics tracking', () => {
  it('metrics contains accessed coverage.delta value after evaluation', () => {
    const ctx: EvaluationContext = { coverage: { delta: -7, absolute: 70 } };
    const result = evaluate(policy('cov-gate', 'coverage.delta() < -5', ['fail']), ctx);
    expect(result.metrics['coverage.delta']).toBe(-7);
  });

  it('metrics contains multiple accessed values across gates', () => {
    const ctx: EvaluationContext = {
      coverage: { delta: -7, absolute: 70 },
      diff: { filesChanged: 15, linesChanged: 100, touched: [] },
    };
    const p: PolicyAST = {
      version: '1',
      gates: [
        { name: 'gate-1', when: parseExpr('coverage.delta() < -5'), then: ['fail'] },
        { name: 'gate-2', when: parseExpr('diff.filesChanged() > 10'), then: ['fail'] },
      ],
    };
    const result = evaluate(p, ctx);
    expect(result.metrics['coverage.delta']).toBe(-7);
    expect(result.metrics['diff.filesChanged']).toBe(15);
  });

  it('metrics contains touched array value when matches predicate is evaluated', () => {
    const ctx: EvaluationContext = { diff: { filesChanged: 1, linesChanged: 5, touched: ['src/auth/login.ts'] } };
    const result = evaluate(
      policy('matches-gate', 'diff.touched.matches("src/auth/**")', ['warn']),
      ctx,
    );
    expect(result.metrics['diff.touched']).toEqual(['src/auth/login.ts']);
  });

  it('metrics is empty when no gates exist', () => {
    const p: PolicyAST = { version: '1', gates: [] };
    const result = evaluate(p, {});
    expect(result.metrics).toEqual({});
  });

  it('metrics is empty when metric is missing from context', () => {
    const result = evaluate(policy('missing', 'coverage.delta() < -5', ['fail']), {});
    expect(Object.keys(result.metrics)).toHaveLength(0);
  });
});
