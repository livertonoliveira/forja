import yaml from 'js-yaml';
import { PolicyFileSchema } from '../parser.js';
import type { PolicyAction } from '../parser.js';

export interface Warning {
  code: string;
  gate: string;
  message: string;
}

function mapCondition(key: string, value: string): string {
  if (key === 'finding.severity') {
    return `findings.countBySeverity("${value}") > 0`;
  }
  return `${key}.is("${value}")`;
}

function mapWhen(when: Record<string, string>): string {
  const entries = Object.entries(when);
  if (entries.length === 0) return 'true';

  const conditions = entries.map(([key, value]) => mapCondition(key, value));
  if (conditions.length === 1) return conditions[0];
  return conditions.map(c => `(${c})`).join(' and ');
}

function escapeDslString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function mapActions(actions: PolicyAction[], gateName: string): { then: string[]; warnings: Warning[] } {
  const then: string[] = [];
  const warnings: Warning[] = [];

  for (const action of actions) {
    switch (action.action) {
      case 'fail_gate':
        then.push('fail');
        break;
      case 'warn_gate':
        then.push('warn');
        break;
      case 'pass_gate':
        then.push('pass');
        break;
      case 'log':
        then.push(`log("${escapeDslString(action.message ?? '')}")`);
        break;
      case 'notify_slack':
        then.push(`notify_slack("${escapeDslString(action.channel ?? '')}", "${escapeDslString(action.message ?? '')}")`);
        break;
      case 'http_post':
        then.push(`http_post("${escapeDslString(action.url ?? '')}")`);
        warnings.push({
          code: 'non_portable_action',
          gate: gateName,
          message: `action http_post with url ${action.url ?? ''} requires manual review`,
        });
        break;
    }
  }

  return { then, warnings };
}

export function migrateLegacyPolicy(yamlContent: string): { dsl: string; warnings: Warning[] } {
  const raw = yaml.load(yamlContent);
  const parsed = PolicyFileSchema.parse(raw);

  const allWarnings: Warning[] = [];

  const gates = parsed.policies.map((policy) => {
    const when = mapWhen(policy.when);
    const { then, warnings } = mapActions(policy.then, policy.name);
    allWarnings.push(...warnings);

    return {
      name: policy.name,
      when,
      then,
    };
  });

  const dslObject = {
    version: '2',
    gates,
  };

  const dsl = yaml.dump(dslObject, {
    quotingType: "'",
    forceQuotes: false,
    lineWidth: -1,
  });

  return { dsl, warnings: allWarnings };
}
