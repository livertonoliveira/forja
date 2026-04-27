import { readFile } from 'fs/promises';
import { resolve } from 'path';
import yaml from 'js-yaml';
import { parseExpr } from './parser.js';
import type { PolicyAST, GateAST, Expr, PredicateCall } from './ast.js';

interface RawGate {
  name?: unknown;
  when?: unknown;
  then?: unknown;
}

interface RawPolicy {
  version?: unknown;
  gates?: unknown;
}

// Converts legacy format `{ "namespace.field": "value" }` to a PredicateCall.
// Convention: always appends "is" as the terminal predicate segment.
// e.g. { "severity": "critical" } → severity.is("critical")
// e.g. { "finding.severity": "high" } → finding.is("high")
function legacyWhenToExpr(obj: Record<string, unknown>): Expr {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    throw new Error('Legacy when object must have at least one entry');
  }

  const [key, val] = entries[0];
  const parts = key.split('.');
  const pred = parts[parts.length - 1];
  const namespace = parts.slice(0, -1);
  const path = namespace.length > 0 ? [...namespace, 'is'] : [pred, 'is'];

  const call: PredicateCall = {
    kind: 'call',
    path,
    args: [{ kind: 'str', value: String(val) }],
    pos: { line: 1, column: 1 },
  };

  return call;
}

export async function loadPolicy(filePath: string): Promise<PolicyAST> {
  const content = await readFile(resolve(filePath), 'utf-8');
  const raw = yaml.load(content) as RawPolicy;

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid policy file: expected an object, got ${typeof raw}`);
  }

  const version = String(raw.version ?? '1');

  if (!Array.isArray(raw.gates)) {
    throw new Error('Invalid policy file: "gates" must be an array');
  }

  const gates: GateAST[] = (raw.gates as RawGate[]).map((gate, index) => {
    if (!gate || typeof gate !== 'object') {
      throw new Error(`Gate at index ${index} must be an object`);
    }

    const name = typeof gate.name === 'string' ? gate.name : `gate-${index}`;

    let when: Expr;
    if (typeof gate.when === 'string') {
      when = parseExpr(gate.when);
    } else if (gate.when !== null && typeof gate.when === 'object') {
      when = legacyWhenToExpr(gate.when as Record<string, unknown>);
    } else {
      throw new Error(`Gate "${name}" has invalid "when" field: expected string or object`);
    }

    let then: string[];
    if (Array.isArray(gate.then)) {
      then = gate.then.map((item) => String(item));
    } else if (typeof gate.then === 'string') {
      then = [gate.then];
    } else {
      then = [];
    }

    return { name, when, then };
  });

  return { version, gates };
}
