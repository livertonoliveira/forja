import { describe, it, expect } from 'vitest';
import type { Finding } from '../../schemas/finding.js';
import type { PolicyFile } from '../parser.js';
import { evaluatePolicy } from '../evaluator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const UUID = '00000000-0000-0000-0000-000000000000';
const ISO_DT = '2024-01-01T00:00:00.000Z';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: UUID,
    runId: UUID,
    phaseId: UUID,
    severity: 'low',
    category: 'general',
    title: 'Test Finding',
    description: 'A test finding.',
    createdAt: ISO_DT,
    ...overrides,
  };
}

/** Minimal policy that mirrors policies/default.yaml */
const defaultPolicy: PolicyFile = {
  version: '1',
  policies: [
    {
      name: 'gate-critical',
      when: { 'finding.severity': 'critical' },
      then: [
        { action: 'fail_gate' },
        { action: 'log', message: 'Critical finding: {{finding.title}}' },
      ],
    },
    {
      name: 'gate-high',
      when: { 'finding.severity': 'high' },
      then: [{ action: 'fail_gate' }],
    },
    {
      name: 'gate-medium',
      when: { 'finding.severity': 'medium' },
      then: [{ action: 'warn_gate' }],
    },
    {
      name: 'gate-low',
      when: { 'finding.severity': 'low' },
      then: [{ action: 'pass_gate' }],
    },
  ],
};

// ---------------------------------------------------------------------------
// evaluatePolicy — decision outcomes
// ---------------------------------------------------------------------------
describe('evaluatePolicy — decision', () => {
  it('returns pass when findings list is empty', () => {
    const result = evaluatePolicy([], defaultPolicy);
    expect(result.decision).toBe('pass');
    expect(result.matchedRules).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
  });

  it('returns fail for a critical finding', () => {
    const finding = makeFinding({ severity: 'critical', title: 'RCE' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.decision).toBe('fail');
  });

  it('returns fail for a high finding', () => {
    const finding = makeFinding({ severity: 'high', title: 'SQL Injection' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.decision).toBe('fail');
  });

  it('returns warn for a medium finding', () => {
    const finding = makeFinding({ severity: 'medium', title: 'CSRF' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.decision).toBe('warn');
  });

  it('returns pass for a low finding', () => {
    const finding = makeFinding({ severity: 'low', title: 'Verbose Logging' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.decision).toBe('pass');
  });

  it('returns fail when mixed findings include at least one critical', () => {
    const findings = [
      makeFinding({ severity: 'low' }),
      makeFinding({ severity: 'medium' }),
      makeFinding({ severity: 'critical', title: 'RCE' }),
    ];
    const result = evaluatePolicy(findings, defaultPolicy);
    expect(result.decision).toBe('fail');
  });

  it('returns fail (not warn) when both high and medium findings are present', () => {
    const findings = [
      makeFinding({ severity: 'high' }),
      makeFinding({ severity: 'medium' }),
    ];
    const result = evaluatePolicy(findings, defaultPolicy);
    expect(result.decision).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// evaluatePolicy — matchedRules
// ---------------------------------------------------------------------------
describe('evaluatePolicy — matchedRules', () => {
  it('contains the rule name when a critical finding matches gate-critical', () => {
    const finding = makeFinding({ severity: 'critical' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.matchedRules).toContain('gate-critical');
  });

  it('contains gate-high when a high finding matches', () => {
    const finding = makeFinding({ severity: 'high' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.matchedRules).toContain('gate-high');
  });

  it('contains gate-medium for a medium finding', () => {
    const finding = makeFinding({ severity: 'medium' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.matchedRules).toContain('gate-medium');
  });

  it('contains gate-low for a low finding', () => {
    const finding = makeFinding({ severity: 'low' });
    const result = evaluatePolicy([finding], defaultPolicy);
    expect(result.matchedRules).toContain('gate-low');
  });

  it('is empty when no rule matches', () => {
    const policyNoMatch: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'only-critical',
          when: { 'finding.severity': 'critical' },
          then: [{ action: 'fail_gate' }],
        },
      ],
    };
    const finding = makeFinding({ severity: 'low' });
    const result = evaluatePolicy([finding], policyNoMatch);
    expect(result.matchedRules).toHaveLength(0);
  });

  it('accumulates rule names across multiple findings', () => {
    const findings = [
      makeFinding({ severity: 'high' }),
      makeFinding({ severity: 'medium' }),
    ];
    const result = evaluatePolicy(findings, defaultPolicy);
    expect(result.matchedRules).toContain('gate-high');
    expect(result.matchedRules).toContain('gate-medium');
  });
});

// ---------------------------------------------------------------------------
// evaluatePolicy — template interpolation
// ---------------------------------------------------------------------------
describe('evaluatePolicy — template interpolation', () => {
  it('interpolates {{finding.title}} in log action messages', () => {
    const finding = makeFinding({ severity: 'critical', title: 'Remote Code Execution' });
    const result = evaluatePolicy([finding], defaultPolicy);

    const logAction = result.actions.find(a => a.action === 'log');
    expect(logAction).toBeDefined();
    expect(logAction?.message).toBe('Critical finding: Remote Code Execution');
  });

  it('interpolates {{finding.title}} correctly when title contains special chars', () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'custom-log',
          when: { 'finding.severity': 'high' },
          then: [{ action: 'log', message: 'Alert: {{finding.title}} in {{finding.category}}' }],
        },
      ],
    };
    const finding = makeFinding({ severity: 'high', title: 'XSS <script>', category: 'security' });
    const result = evaluatePolicy([finding], policy);

    const logAction = result.actions.find(a => a.action === 'log');
    expect(logAction?.message).toBe('Alert: XSS <script> in security');
  });

  it('leaves unresolved placeholders as empty string when field does not exist', () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'missing-field',
          when: { 'finding.severity': 'low' },
          then: [{ action: 'log', message: 'Value: {{finding.nonExistentField}}' }],
        },
      ],
    };
    const finding = makeFinding({ severity: 'low' });
    const result = evaluatePolicy([finding], policy);

    const logAction = result.actions.find(a => a.action === 'log');
    expect(logAction?.message).toBe('Value: ');
  });

  it('does not mutate actions that have no message', () => {
    const finding = makeFinding({ severity: 'high' });
    const result = evaluatePolicy([finding], defaultPolicy);

    const failAction = result.actions.find(a => a.action === 'fail_gate');
    expect(failAction).toBeDefined();
    expect(failAction?.message).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// evaluatePolicy — with a no-rules policy
// ---------------------------------------------------------------------------
describe('evaluatePolicy — edge cases', () => {
  it('returns pass when policy has no rules', () => {
    const emptyPolicy: PolicyFile = { version: '1', policies: [] };
    const finding = makeFinding({ severity: 'critical' });
    const result = evaluatePolicy([finding], emptyPolicy);
    expect(result.decision).toBe('pass');
    expect(result.matchedRules).toHaveLength(0);
  });

  it('collects all actions from multiple matching rules across multiple findings', () => {
    const findings = [
      makeFinding({ severity: 'critical', title: 'RCE' }),
      makeFinding({ severity: 'low' }),
    ];
    const result = evaluatePolicy(findings, defaultPolicy);
    // gate-critical has 2 actions (fail_gate + log), gate-low has 1 (pass_gate)
    expect(result.actions.length).toBeGreaterThanOrEqual(3);
  });
});
