import type { Expr, Or, And, Not, Comparison, PredicateCall, Value, PolicyAST } from './ast.js';
import type { EvaluationContext } from './context.js';

export interface EvaluationResult {
  verdict: 'pass' | 'warn' | 'fail';
  justification: string;
  metrics: Record<string, unknown>;
}

type NodeResult =
  | { ok: true; value: boolean | number | string; trace: string }
  | { ok: false; missing: string; trace: string };

function resolvePath(path: string[], ctx: EvaluationContext): unknown {
  let current: unknown = ctx;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const globCache = new Map<string, RegExp>();

function globMatch(str: string, pattern: string): boolean {
  let regex = globCache.get(pattern);
  if (!regex) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\*\*/g, '[\\s\\S]*').replace(/\*/g, '[^/]*');
    regex = new RegExp(`^${regexStr}$`);
    globCache.set(pattern, regex);
  }
  return regex.test(str);
}

function literalValue(v: Value): number | string | boolean {
  return v.value;
}

function evalCall(
  expr: PredicateCall,
  ctx: EvaluationContext,
  metrics: Record<string, unknown>,
): NodeResult {
  const lastSegment = expr.path[expr.path.length - 1];

  if (lastSegment === 'is') {
    const dataPath = expr.path.slice(0, -1);
    const pathStr = dataPath.join('.');
    const resolved = resolvePath(dataPath, ctx);

    if (resolved === undefined || resolved === null) {
      return { ok: false, missing: pathStr, trace: `metric ${pathStr} unavailable` };
    }

    metrics[pathStr] = resolved;
    const expected = literalValue(expr.args[0]);
    const result = String(resolved) === String(expected);
    return { ok: true, value: result, trace: `${pathStr}.is(${String(expected)}) = ${String(result)}` };
  }

  if (lastSegment === 'matches') {
    const dataPath = expr.path.slice(0, -1);
    const pathStr = dataPath.join('.');
    const resolved = resolvePath(dataPath, ctx);

    if (resolved === undefined || resolved === null) {
      return { ok: false, missing: pathStr, trace: `metric ${pathStr} unavailable` };
    }

    metrics[pathStr] = resolved;
    const pattern = String(literalValue(expr.args[0]));
    let result: boolean;

    if (Array.isArray(resolved)) {
      result = resolved.some((item) => globMatch(String(item), pattern));
    } else {
      result = globMatch(String(resolved), pattern);
    }

    return { ok: true, value: result, trace: `${pathStr}.matches("${pattern}") = ${String(result)}` };
  }

  // Raw value resolution for use in Comparison
  const pathStr = expr.path.join('.');
  const resolved = resolvePath(expr.path, ctx);

  if (resolved === undefined || resolved === null) {
    return { ok: false, missing: pathStr, trace: `metric ${pathStr} unavailable` };
  }

  metrics[pathStr] = resolved;
  return { ok: true, value: resolved as boolean | number | string, trace: `${pathStr} = ${String(resolved)}` };
}

function evalCmp(
  expr: Comparison,
  ctx: EvaluationContext,
  metrics: Record<string, unknown>,
): NodeResult {
  const leftResult = evalCall(expr.left, ctx, metrics);
  if (!leftResult.ok) return leftResult;

  const rightVal = literalValue(expr.right);
  const op = expr.op;
  const leftVal = leftResult.value;
  let result: boolean;

  if (op === '==' || op === '!=') {
    const eq = String(leftVal) === String(rightVal);
    result = op === '==' ? eq : !eq;
  } else {
    const leftNum = Number(leftVal);
    const rightNum = Number(rightVal);
    if (op === '>') result = leftNum > rightNum;
    else if (op === '<') result = leftNum < rightNum;
    else if (op === '>=') result = leftNum >= rightNum;
    else result = leftNum <= rightNum;
  }

  return {
    ok: true,
    value: result,
    trace: `${leftResult.trace}, (${String(leftVal)} ${op} ${String(rightVal)}) = ${String(result)}`,
  };
}

function evalExpr(
  expr: Expr,
  ctx: EvaluationContext,
  metrics: Record<string, unknown>,
): NodeResult {
  switch (expr.kind) {
    case 'or': {
      const left = evalExpr((expr as Or).left, ctx, metrics);
      if (left.ok && left.value === true) {
        return { ok: true, value: true, trace: `${left.trace} OR (short-circuit) = true` };
      }
      const right = evalExpr((expr as Or).right, ctx, metrics);
      if (!left.ok) return left;
      if (!right.ok) return right;
      const result = (left.value as boolean) || (right.value as boolean);
      return { ok: true, value: result, trace: `(${left.trace} OR ${right.trace}) = ${String(result)}` };
    }
    case 'and': {
      const left = evalExpr((expr as And).left, ctx, metrics);
      if (left.ok && left.value === false) {
        return { ok: true, value: false, trace: `${left.trace} AND (short-circuit) = false` };
      }
      const right = evalExpr((expr as And).right, ctx, metrics);
      if (!left.ok) return left;
      if (!right.ok) return right;
      const result = (left.value as boolean) && (right.value as boolean);
      return { ok: true, value: result, trace: `(${left.trace} AND ${right.trace}) = ${String(result)}` };
    }
    case 'not': {
      const inner = evalExpr((expr as Not).inner, ctx, metrics);
      if (!inner.ok) return inner;
      const result = !(inner.value as boolean);
      return { ok: true, value: result, trace: `NOT ${inner.trace} = ${String(result)}` };
    }
    case 'cmp':
      return evalCmp(expr as Comparison, ctx, metrics);
    case 'call':
      return evalCall(expr as PredicateCall, ctx, metrics);
  }
}

export function evaluate(policy: PolicyAST, ctx: EvaluationContext): EvaluationResult {
  let verdict: 'pass' | 'warn' | 'fail' = 'pass';
  const traceParts: string[] = [];
  const metrics: Record<string, unknown> = {};

  for (const gate of policy.gates) {
    const result = evalExpr(gate.when, ctx, metrics);

    if (!result.ok) {
      if (verdict === 'pass') verdict = 'warn';
      traceParts.push(`[${gate.name}] ${result.trace}`);
      continue;
    }

    traceParts.push(`[${gate.name}] ${result.trace}`);

    if (result.value === true) {
      for (const action of gate.then) {
        if (action === 'fail') {
          verdict = 'fail';
        } else if (action === 'warn' && verdict !== 'fail') {
          verdict = 'warn';
        }
      }
    }
  }

  return {
    verdict,
    justification: traceParts.join(' | '),
    metrics,
  };
}
