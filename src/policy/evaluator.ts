import type { Finding } from '../schemas/finding.js';
import type { PolicyFile, PolicyAction } from './parser.js';

export interface EvaluationResult {
  decision: 'pass' | 'warn' | 'fail';
  matchedRules: string[];
  actions: PolicyAction[];
}

function resolveDotPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function interpolate(template: string, finding: Finding): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split('.');
    if (parts[0] === 'finding') {
      const value = resolveDotPath(toFindingRecord(finding), parts.slice(1).join('.'));
      return value !== undefined ? String(value) : '';
    }
    return '';
  });
}

function toFindingRecord(finding: Finding): Record<string, unknown> {
  return finding as unknown as Record<string, unknown>;
}

function matchesConditions(finding: Finding, when: Record<string, string>): boolean {
  return Object.entries(when).every(([key, expectedValue]) => {
    const parts = key.split('.');
    if (parts[0] !== 'finding') {
      console.warn(`[forja] policy: unrecognized when-key prefix "${parts[0]}" in condition "${key}" — rule skipped`);
      return false;
    }
    const actual = resolveDotPath(toFindingRecord(finding), parts.slice(1).join('.'));
    return String(actual) === expectedValue;
  });
}

const UNIMPLEMENTED_ACTIONS = new Set(['http_post']);

export function evaluatePolicy(findings: Finding[], policy: PolicyFile): EvaluationResult {
  const matchedRules: string[] = [];
  const actions: PolicyAction[] = [];

  for (const finding of findings) {
    for (const rule of policy.policies) {
      if (matchesConditions(finding, rule.when)) {
        matchedRules.push(rule.name);
        for (const action of rule.then) {
          if (UNIMPLEMENTED_ACTIONS.has(action.action)) {
            console.warn(`[forja] policy: action "${action.action}" in rule "${rule.name}" is not yet implemented — skipped`);
          }
          const resolvedAction = action.message
            ? { ...action, message: interpolate(action.message, finding) }
            : action;
          actions.push(resolvedAction);
        }
      }
    }
  }

  const decision: 'pass' | 'warn' | 'fail' =
    actions.some(a => a.action === 'fail_gate') ? 'fail' :
    actions.some(a => a.action === 'warn_gate') ? 'warn' : 'pass';

  return { decision, matchedRules, actions };
}
