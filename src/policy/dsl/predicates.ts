import { minimatch } from 'minimatch';
import type { EvaluationContext } from './context.js';
import type { Value } from './ast.js';

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

/**
 * A predicate implementation: pure function that resolves a named predicate from context.
 * Returns `undefined` when the required context data is unavailable.
 */
export type PredicateImpl = (ctx: EvaluationContext, args: Value[]) => number | boolean | string | undefined;

/**
 * Registry of the 8 canonical predicates available in the gate DSL.
 * The evaluator looks up predicate names here (by joining path segments with ".") before
 * falling back to raw path resolution.
 *
 * @example
 * const fn = PREDICATES_REGISTRY['coverage.delta'];
 * const value = fn(ctx, []);  // → -0.03
 */
const _registry: Record<string, PredicateImpl> = {
  /**
   * Coverage delta between current run and baseline. Unit: fraction (0.05 = 5%).
   * @example `coverage.delta() < -0.05`
   */
  'coverage.delta': (ctx) => ctx.coverage?.delta,

  /**
   * Absolute coverage percentage of the current run.
   * @example `coverage.absolute() < 80`
   */
  'coverage.absolute': (ctx) => ctx.coverage?.absolute,

  /**
   * Number of files changed in the diff.
   * @example `diff.filesChanged() > 10`
   */
  'diff.filesChanged': (ctx) => ctx.diff?.filesChanged,

  /**
   * Number of lines changed in the diff.
   * @example `diff.linesChanged() > 500`
   */
  'diff.linesChanged': (ctx) => ctx.diff?.linesChanged,

  /**
   * Returns true if any file in diff.touched matches the given glob pattern (minimatch).
   * @example `touched.matches("src/auth/**")`
   */
  'touched.matches': (ctx, args): boolean | undefined => {
    if (!ctx.diff?.touched || args.length === 0) return undefined;
    const pattern = String(args[0].value);
    return ctx.diff.touched.some((f) => minimatch(f, pattern));
  },

  /**
   * Duration of a named pipeline phase in milliseconds.
   * Without args falls back to the scalar phaseDurationMs field.
   * @example `time.phaseDurationMs("test") > 30000`
   */
  'time.phaseDurationMs': (ctx, args) => {
    if (args.length > 0) {
      const phase = String(args[0].value);
      return ctx.time?.phases?.[phase];
    }
    return ctx.time?.phaseDurationMs;
  },

  /**
   * Total LLM cost of the run in USD.
   * @example `cost.usd() > 1.50`
   */
  'cost.usd': (ctx) => ctx.cost?.usd,

  /**
   * Count of findings with the given severity ('critical' | 'high' | 'medium' | 'low').
   * @example `findings.countBySeverity("critical") > 0`
   */
  'findings.countBySeverity': (ctx, args): number | undefined => {
    if (args.length === 0) return undefined;
    const severity = String(args[0].value);
    if (!VALID_SEVERITIES.has(severity)) return undefined;
    return ctx.findings?.countBySeverity?.[severity as 'critical' | 'high' | 'medium' | 'low'];
  },
};

export const PREDICATES_REGISTRY: Record<string, PredicateImpl> = Object.freeze(_registry);
