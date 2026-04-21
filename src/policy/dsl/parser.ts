import type { CmpOp, Expr, Value, PredicateCall, Or, And, Not, Comparison } from './ast.js';

type TokenType = 'keyword' | 'ident' | 'number' | 'string' | 'punct';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS = new Set(['and', 'or', 'not', 'true', 'false']);
const CMP_OPS = new Set(['>', '<', '>=', '<=', '==', '!=']);

export class PolicyParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly expected: string,
    public readonly got: string,
    public readonly source?: string,
  ) {
    super(message);
    this.name = 'PolicyParseError';
  }

  format(source?: string): string {
    const src = source ?? this.source ?? '';
    const lines = src.split('\n');
    const lineText = lines[this.line - 1] ?? '';
    const pointer = ' '.repeat(Math.max(0, this.column - 1)) + '^';
    return `${lineText}\n${pointer}\nLine ${this.line}, Column ${this.column}: Expected ${this.expected}, got ${this.got}`;
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  function advance(): string {
    const ch = input[i++];
    if (ch === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }

  function peek(): string {
    return input[i] ?? '';
  }

  function peekAhead(offset: number): string {
    return input[i + offset] ?? '';
  }

  while (i < input.length) {
    const ch = peek();

    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance();
      continue;
    }

    const tokLine = line;
    const tokCol = column;

    if (ch === '"') {
      advance();
      const strStart = i;
      while (i < input.length && peek() !== '"') {
        if (peek() === '\n') {
          throw new PolicyParseError(
            `Unterminated string literal at line ${tokLine}, column ${tokCol}`,
            tokLine,
            tokCol,
            'closing "',
            'end-of-line',
            input,
          );
        }
        advance();
      }
      if (i >= input.length) {
        throw new PolicyParseError(
          `Unterminated string literal at line ${tokLine}, column ${tokCol}`,
          tokLine,
          tokCol,
          'closing "',
          'end-of-input',
          input,
        );
      }
      const str = input.slice(strStart, i);
      advance();
      tokens.push({ type: 'string', value: str, line: tokLine, column: tokCol });
      continue;
    }

    if ((ch >= '0' && ch <= '9') || (ch === '-' && peekAhead(1) >= '0' && peekAhead(1) <= '9')) {
      const numStart = i;
      advance();
      while (peek() >= '0' && peek() <= '9') {
        advance();
      }
      if (peek() === '.' && peekAhead(1) >= '0' && peekAhead(1) <= '9') {
        advance();
        while (peek() >= '0' && peek() <= '9') {
          advance();
        }
      }
      tokens.push({ type: 'number', value: input.slice(numStart, i), line: tokLine, column: tokCol });
      continue;
    }

    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const identStart = i;
      while (
        (peek() >= 'a' && peek() <= 'z') ||
        (peek() >= 'A' && peek() <= 'Z') ||
        (peek() >= '0' && peek() <= '9') ||
        peek() === '_'
      ) {
        advance();
      }
      const ident = input.slice(identStart, i);
      const type: TokenType = KEYWORDS.has(ident) ? 'keyword' : 'ident';
      tokens.push({ type, value: ident, line: tokLine, column: tokCol });
      continue;
    }

    if (ch === '>' || ch === '<' || ch === '=' || ch === '!') {
      let op = advance();
      if (peek() === '=') {
        op += advance();
      }
      if (!CMP_OPS.has(op)) {
        throw new PolicyParseError(
          `Unexpected character '${op}' at line ${tokLine}, column ${tokCol}`,
          tokLine,
          tokCol,
          'valid operator',
          `'${op}'`,
          input,
        );
      }
      tokens.push({ type: 'punct', value: op, line: tokLine, column: tokCol });
      continue;
    }

    if (ch === '(' || ch === ')' || ch === ',' || ch === '.') {
      advance();
      tokens.push({ type: 'punct', value: ch, line: tokLine, column: tokCol });
      continue;
    }

    throw new PolicyParseError(
      `Unexpected character '${ch}' at line ${tokLine}, column ${tokCol}`,
      tokLine,
      tokCol,
      'valid token',
      `'${ch}'`,
      input,
    );
  }

  return tokens;
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private endOfInputPos(): { line: number; column: number } {
    const last = this.tokens[this.tokens.length - 1];
    return last ? { line: last.line, column: last.column + last.value.length } : { line: 1, column: 1 };
  }

  private consume(): Token {
    const tok = this.tokens[this.pos++];
    if (!tok) {
      throw this.error('expression', 'end-of-input', this.endOfInputPos());
    }
    return tok;
  }

  private error(expected: string, got: string, pos: { line: number; column: number }): PolicyParseError {
    return new PolicyParseError(
      `Line ${pos.line}, Column ${pos.column}: Expected ${expected}, got ${got}`,
      pos.line,
      pos.column,
      expected,
      got,
      this.source,
    );
  }

  private expect(type: TokenType, value?: string): Token {
    const tok = this.peek();
    if (!tok) {
      const last = this.tokens[this.tokens.length - 1];
      const pos = last ? { line: last.line, column: last.column + last.value.length } : { line: 1, column: 1 };
      throw this.error(value ?? type, 'end-of-input', pos);
    }
    if (tok.type !== type || (value !== undefined && tok.value !== value)) {
      throw this.error(value ? `'${value}'` : type, `'${tok.value}'`, { line: tok.line, column: tok.column });
    }
    return this.consume();
  }

  parseExpr(): Expr {
    return this.parseOr();
  }

  parseOr(): Expr {
    let left = this.parseAnd();

    while (this.peek()?.type === 'keyword' && this.peek()?.value === 'or') {
      const tok = this.consume();
      const right = this.parseAnd();
      left = {
        kind: 'or',
        left,
        right,
        pos: { line: tok.line, column: tok.column },
      } satisfies Or;
    }

    return left;
  }

  parseAnd(): Expr {
    let left = this.parseNot();

    while (this.peek()?.type === 'keyword' && this.peek()?.value === 'and') {
      const tok = this.consume();
      const right = this.parseNot();
      left = {
        kind: 'and',
        left,
        right,
        pos: { line: tok.line, column: tok.column },
      } satisfies And;
    }

    return left;
  }

  private static readonly MAX_NOT_DEPTH = 64;

  parseNot(depth = 0): Expr {
    if (depth > Parser.MAX_NOT_DEPTH) {
      throw this.error('expression', 'maximum nesting depth exceeded', this.endOfInputPos());
    }
    const tok = this.peek();
    if (tok?.type === 'keyword' && tok.value === 'not') {
      this.consume();
      const inner = this.parseNot(depth + 1);
      return {
        kind: 'not',
        inner,
        pos: { line: tok.line, column: tok.column },
      } satisfies Not;
    }
    return this.parsePrimary();
  }

  parsePrimary(): Expr {
    const tok = this.peek();

    if (!tok) {
      throw this.error('expression', 'end-of-input', this.endOfInputPos());
    }

    if (tok.type === 'punct' && tok.value === '(') {
      this.consume();
      const inner = this.parseExpr();
      this.expect('punct', ')');
      return inner;
    }

    if (tok.type === 'keyword' && (tok.value === 'and' || tok.value === 'or')) {
      throw this.error('expression', `keyword '${tok.value}'`, { line: tok.line, column: tok.column });
    }

    if (tok.type !== 'ident') {
      throw this.error('identifier or (', `'${tok.value}'`, { line: tok.line, column: tok.column });
    }

    const call = this.parseCall();
    const next = this.peek();

    if (next?.type === 'punct' && CMP_OPS.has(next.value)) {
      const opTok = this.consume();
      const right = this.parseValue();
      return {
        kind: 'cmp',
        op: opTok.value as CmpOp,
        left: call,
        right,
        pos: { line: opTok.line, column: opTok.column },
      } satisfies Comparison;
    }

    return call;
  }

  parseCall(): PredicateCall {
    const first = this.expect('ident');
    const path: string[] = [first.value];

    while (this.peek()?.type === 'punct' && this.peek()?.value === '.') {
      this.consume();
      const part = this.expect('ident');
      path.push(part.value);
    }

    this.expect('punct', '(');

    const args: Value[] = [];
    if (!(this.peek()?.type === 'punct' && this.peek()?.value === ')')) {
      args.push(this.parseValue());
      while (this.peek()?.type === 'punct' && this.peek()?.value === ',') {
        this.consume();
        const next = this.peek();
        if (next?.type === 'punct' && next.value === ')') {
          throw this.error('value', "')'", { line: next.line, column: next.column });
        }
        args.push(this.parseValue());
      }
    }

    this.expect('punct', ')');

    return {
      kind: 'call',
      path,
      args,
      pos: { line: first.line, column: first.column },
    };
  }

  parseValue(): Value {
    const tok = this.peek();

    if (!tok) {
      throw this.error('value', 'end-of-input', this.endOfInputPos());
    }

    if (tok.type === 'string') {
      this.consume();
      return { kind: 'str', value: tok.value };
    }

    if (tok.type === 'number') {
      this.consume();
      return { kind: 'num', value: parseFloat(tok.value) };
    }

    if (tok.type === 'keyword' && (tok.value === 'true' || tok.value === 'false')) {
      this.consume();
      return { kind: 'bool', value: tok.value === 'true' };
    }

    if (tok.type === 'ident') {
      this.consume();
      return { kind: 'ident', value: tok.value };
    }

    throw this.error('value', `'${tok.value}'`, { line: tok.line, column: tok.column });
  }
}

export function parseExpr(input: string): Expr {
  if (input.trim() === '') {
    throw new PolicyParseError(
      'Line 1, Column 1: Expected expression, got end-of-input',
      1,
      1,
      'expression',
      'end-of-input',
      input,
    );
  }

  const tokens = tokenize(input);

  if (tokens.length === 0) {
    throw new PolicyParseError(
      'Line 1, Column 1: Expected expression, got end-of-input',
      1,
      1,
      'expression',
      'end-of-input',
      input,
    );
  }

  const parser = new Parser(tokens, input);
  const expr = parser.parseExpr();

  const remaining = parser.peek();
  if (remaining) {
    throw new PolicyParseError(
      `Line ${remaining.line}, Column ${remaining.column}: Unexpected token '${remaining.value}'`,
      remaining.line,
      remaining.column,
      'end-of-input',
      `'${remaining.value}'`,
      input,
    );
  }

  return expr;
}
