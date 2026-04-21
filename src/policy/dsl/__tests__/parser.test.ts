import { describe, it, expect } from 'vitest';
import { parseExpr, PolicyParseError } from '../parser.js';
import type { Expr, And, Or, Not, Comparison, PredicateCall } from '../ast.js';


describe('parseExpr — valid expressions', () => {
  it('simple predicate call', () => {
    const result = parseExpr('severity.is("critical")');
    expect(result.kind).toBe('call');
    const c = result as PredicateCall;
    expect(c.path).toEqual(['severity', 'is']);
    expect(c.args).toEqual([{ kind: 'str', value: 'critical' }]);
  });

  it('predicate with number argument', () => {
    const result = parseExpr('finding.count() >= 10') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.op).toBe('>=');
    expect((result.left as PredicateCall).path).toEqual(['finding', 'count']);
    expect(result.right).toEqual({ kind: 'num', value: 10 });
  });

  it('predicate with boolean argument', () => {
    const result = parseExpr('file.changed(true)') as PredicateCall;
    expect(result.kind).toBe('call');
    expect(result.args).toEqual([{ kind: 'bool', value: true }]);
  });

  it('negation with not', () => {
    const result = parseExpr('not severity.is("low")') as Not;
    expect(result.kind).toBe('not');
    expect((result.inner as PredicateCall).path).toEqual(['severity', 'is']);
  });

  it('AND expression', () => {
    const result = parseExpr('severity.is("high") and file.changed("src/**")') as And;
    expect(result.kind).toBe('and');
    expect((result.left as PredicateCall).path).toEqual(['severity', 'is']);
    expect((result.right as PredicateCall).path).toEqual(['file', 'changed']);
  });

  it('OR expression', () => {
    const result = parseExpr('severity.is("critical") or severity.is("high")') as Or;
    expect(result.kind).toBe('or');
    expect((result.left as PredicateCall).path).toEqual(['severity', 'is']);
    expect((result.right as PredicateCall).path).toEqual(['severity', 'is']);
  });

  it('combination: or with and in right', () => {
    const result = parseExpr(
      'severity.is("high") or (severity.is("medium") and finding.count() >= 10)',
    ) as Or;
    expect(result.kind).toBe('or');
    const right = result.right as And;
    expect(right.kind).toBe('and');
  });

  it('parentheses altering precedence', () => {
    const result = parseExpr(
      '(severity.is("a") or severity.is("b")) and not file.changed("test/**")',
    ) as And;
    expect(result.kind).toBe('and');
    expect(result.left.kind).toBe('or');
    const notExpr = result.right as Not;
    expect(notExpr.kind).toBe('not');
  });

  it('multi-arg predicate', () => {
    const result = parseExpr('coverage.dropped(5, "src/**")') as PredicateCall;
    expect(result.kind).toBe('call');
    expect(result.args).toEqual([
      { kind: 'num', value: 5 },
      { kind: 'str', value: 'src/**' },
    ]);
  });

  it('negative number argument', () => {
    const result = parseExpr('finding.count() > -1') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.right).toEqual({ kind: 'num', value: -1 });
  });

  it('decimal number argument', () => {
    const result = parseExpr('coverage.dropped(0.5)') as PredicateCall;
    expect(result.kind).toBe('call');
    expect(result.args).toEqual([{ kind: 'num', value: 0.5 }]);
  });

  it('predicate with no args', () => {
    const result = parseExpr('finding.count()') as PredicateCall;
    expect(result.kind).toBe('call');
    expect(result.args).toEqual([]);
  });

  it('long namespace path', () => {
    const result = parseExpr('my.namespace.predicate("arg")') as PredicateCall;
    expect(result.kind).toBe('call');
    expect(result.path).toEqual(['my', 'namespace', 'predicate']);
  });

  it('empty string argument', () => {
    const result = parseExpr('severity.is("")') as PredicateCall;
    expect(result.kind).toBe('call');
    expect(result.args).toEqual([{ kind: 'str', value: '' }]);
  });

  it('false boolean argument', () => {
    const result = parseExpr('file.changed(false)') as PredicateCall;
    expect(result.kind).toBe('call');
    expect(result.args).toEqual([{ kind: 'bool', value: false }]);
  });

  it('comparison with ==', () => {
    const result = parseExpr('finding.severity() == "high"') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.op).toBe('==');
    expect(result.right).toEqual({ kind: 'str', value: 'high' });
  });

  it('comparison with !=', () => {
    const result = parseExpr('finding.count() != 0') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.op).toBe('!=');
  });

  it('comparison with <', () => {
    const result = parseExpr('coverage.total() < 80') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.op).toBe('<');
    expect(result.right).toEqual({ kind: 'num', value: 80 });
  });

  it('comparison with <=', () => {
    const result = parseExpr('coverage.total() <= 50') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.op).toBe('<=');
  });

  it('comparison with >', () => {
    const result = parseExpr('finding.count() > 5') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.op).toBe('>');
  });

  it('nested not', () => {
    const result = parseExpr('not not severity.is("low")');
    expect(result.kind).toBe('not');
    expect((result as Not).inner.kind).toBe('not');
  });

  it('three-part AND chain', () => {
    const result = parseExpr('a.check() and b.check() and c.check()');
    expect(result.kind).toBe('and');
    const andNode = result as And;
    expect(andNode.right.kind).toBe('call');
    expect(andNode.left.kind).toBe('and');
  });

  it('three-part OR chain', () => {
    const result = parseExpr('a.check() or b.check() or c.check()');
    expect(result.kind).toBe('or');
    const orNode = result as Or;
    expect(orNode.left.kind).toBe('or');
    expect(orNode.right.kind).toBe('call');
  });

  it('mixed AND/OR with parentheses', () => {
    const result = parseExpr('a.x() and (b.x() or c.x())') as And;
    expect(result.kind).toBe('and');
    expect(result.right.kind).toBe('or');
  });

  it('predicate with integer zero', () => {
    const result = parseExpr('finding.count() == 0') as Comparison;
    expect(result.kind).toBe('cmp');
    expect(result.right).toEqual({ kind: 'num', value: 0 });
  });

  it('position information is recorded', () => {
    const result = parseExpr('severity.is("critical")') as PredicateCall;
    expect(result.pos.line).toBe(1);
    expect(result.pos.column).toBe(1);
  });

  it('multiline expression', () => {
    const result = parseExpr('severity.is("high")\nand file.changed("src/**")') as And;
    expect(result.kind).toBe('and');
  });

  it('complex nested expression', () => {
    const result = parseExpr(
      '(a.x() and b.x()) or (c.x() and not d.x())',
    ) as Or;
    expect(result.kind).toBe('or');
    expect(result.left.kind).toBe('and');
    expect(result.right.kind).toBe('and');
    expect(((result.right as And).right as Not).kind).toBe('not');
  });
});

describe('parseExpr — precedence', () => {
  it('a and b or c → (a and b) or c', () => {
    const result = parseExpr('a() and b() or c()') as Or;
    expect(result.kind).toBe('or');
    expect(result.left.kind).toBe('and');
    const left = result.left as And;
    expect((left.left as PredicateCall).path).toEqual(['a']);
    expect((left.right as PredicateCall).path).toEqual(['b']);
    expect((result.right as PredicateCall).path).toEqual(['c']);
  });

  it('a or b and c → a or (b and c)', () => {
    const result = parseExpr('a() or b() and c()') as Or;
    expect(result.kind).toBe('or');
    expect(result.left.kind).toBe('call');
    expect(result.right.kind).toBe('and');
    const right = result.right as And;
    expect((right.left as PredicateCall).path).toEqual(['b']);
    expect((right.right as PredicateCall).path).toEqual(['c']);
  });

  it('not a and b → (not a) and b', () => {
    const result = parseExpr('not a() and b()') as And;
    expect(result.kind).toBe('and');
    expect(result.left.kind).toBe('not');
    expect(result.right.kind).toBe('call');
  });
});

describe('parseExpr — AST snapshot', () => {
  it('severity.is("critical") and not file.changed("src/**")', () => {
    const result = parseExpr('severity.is("critical") and not file.changed("src/**")') as And;
    expect(result.kind).toBe('and');

    const left = result.left as PredicateCall;
    expect(left.kind).toBe('call');
    expect(left.path).toEqual(['severity', 'is']);
    expect(left.args).toEqual([{ kind: 'str', value: 'critical' }]);

    const right = result.right as Not;
    expect(right.kind).toBe('not');

    const inner = right.inner as PredicateCall;
    expect(inner.kind).toBe('call');
    expect(inner.path).toEqual(['file', 'changed']);
    expect(inner.args).toEqual([{ kind: 'str', value: 'src/**' }]);
  });
});

describe('parseExpr — syntax errors', () => {
  it('empty expression throws PolicyParseError', () => {
    expect(() => parseExpr('')).toThrow(PolicyParseError);
  });

  it('whitespace-only expression throws PolicyParseError', () => {
    expect(() => parseExpr('   ')).toThrow(PolicyParseError);
  });

  it('unclosed parenthesis throws PolicyParseError', () => {
    expect(() => parseExpr('(severity.is("a")')).toThrow(PolicyParseError);
  });

  it('operator without right-hand value throws PolicyParseError', () => {
    expect(() => parseExpr('severity.is("a") >=')).toThrow(PolicyParseError);
  });

  it('identifier starting with digit throws PolicyParseError', () => {
    expect(() => parseExpr('1severity()')).toThrow(PolicyParseError);
  });

  it('unclosed string literal throws PolicyParseError', () => {
    expect(() => parseExpr('severity.is("critical)')).toThrow(PolicyParseError);
  });

  it('and without left operand throws PolicyParseError', () => {
    expect(() => parseExpr('and severity.is("a")')).toThrow(PolicyParseError);
  });

  it('or at end of expression throws PolicyParseError', () => {
    expect(() => parseExpr('severity.is("a") or')).toThrow(PolicyParseError);
  });

  it('trailing comma in args throws PolicyParseError', () => {
    expect(() => parseExpr('severity.is("a",)')).toThrow(PolicyParseError);
  });

  it('empty parentheses throws PolicyParseError', () => {
    expect(() => parseExpr('()')).toThrow(PolicyParseError);
  });

  it('PolicyParseError has correct properties', () => {
    let err: PolicyParseError | undefined;
    try {
      parseExpr('');
    } catch (e) {
      err = e as PolicyParseError;
    }
    expect(err).toBeInstanceOf(PolicyParseError);
    expect(err?.name).toBe('PolicyParseError');
    expect(typeof err?.line).toBe('number');
    expect(typeof err?.column).toBe('number');
    expect(typeof err?.expected).toBe('string');
    expect(typeof err?.got).toBe('string');
  });

  it('PolicyParseError.format() returns formatted string with pointer', () => {
    let err: PolicyParseError | undefined;
    try {
      parseExpr('severity.is("a") >=');
    } catch (e) {
      err = e as PolicyParseError;
    }
    expect(err).toBeInstanceOf(PolicyParseError);
    const formatted = err!.format();
    expect(typeof formatted).toBe('string');
    expect(formatted).toContain('^');
  });
});
