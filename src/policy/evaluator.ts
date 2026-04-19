import type { Finding } from '../schemas/finding.js';
import type { PolicyFile, PolicyAction } from './parser.js';
import { deepMapStrings } from './deep-map-strings.js';

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
    return `{{${path}}}`;
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

function interpolateRecord(obj: Record<string, unknown>, finding: Finding): Record<string, unknown> {
  return deepMapStrings(obj, v => interpolate(v, finding));
}

function resolveAction(action: PolicyAction, finding: Finding): PolicyAction {
  const resolved: PolicyAction = { ...action };
  if (resolved.message) resolved.message = interpolate(resolved.message, finding);
  if (resolved.url) resolved.url = interpolate(resolved.url, finding);
  if (resolved.payload) resolved.payload = interpolateRecord(resolved.payload, finding);
  return resolved;
}

export function evaluatePolicy(findings: Finding[], policy: PolicyFile): EvaluationResult {
  const matchedRules: string[] = [];
  const actions: PolicyAction[] = [];

  for (const finding of findings) {
    for (const rule of policy.policies) {
      if (matchesConditions(finding, rule.when)) {
        matchedRules.push(rule.name);
        for (const action of rule.then) {
          const resolvedAction = resolveAction(action, finding);
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
