export type CmpOp = '>' | '<' | '>=' | '<=' | '==' | '!=';

export interface Position {
  line: number;
  column: number;
}

export type Expr = Or | And | Not | Comparison | PredicateCall;

export interface Or {
  kind: 'or';
  left: Expr;
  right: Expr;
  pos: Position;
}

export interface And {
  kind: 'and';
  left: Expr;
  right: Expr;
  pos: Position;
}

export interface Not {
  kind: 'not';
  inner: Expr;
  pos: Position;
}

export interface Comparison {
  kind: 'cmp';
  op: CmpOp;
  left: PredicateCall;
  right: Value;
  pos: Position;
}

export interface PredicateCall {
  kind: 'call';
  path: string[];
  args: Value[];
  pos: Position;
}

export type Value =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'ident'; value: string };

export interface PolicyAST {
  version: string;
  gates: GateAST[];
}

export interface GateAST {
  name: string;
  when: Expr;
  then: string[];
}
