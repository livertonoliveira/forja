import { describe, it, expect } from 'vitest';
import { loadPolicy } from '../parser.js';
import { evaluatePolicy } from '../evaluator.js';
import type { Finding } from '../../schemas/finding.js';
import { CURRENT_SCHEMA_VERSION } from '../../schemas/versioning.js';
import { join } from 'path';

const POLICY_PATH = join(process.cwd(), 'policies/default.yaml');

// Helper to create a minimal Finding
function makeFinding(severity: Finding['severity'], title = 'Test'): Finding {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: '00000000-0000-4000-8000-000000000001',
    runId: '00000000-0000-4000-8000-000000000002',
    phaseId: '00000000-0000-4000-8000-000000000003',
    severity,
    category: 'test',
    title,
    description: 'test description',
    createdAt: new Date().toISOString(),
  };
}

describe('policy integration', () => {
  it('loads and parses default.yaml without errors', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    expect(policy.version).toBe('1');
    expect(Array.isArray(policy.policies)).toBe(true);
    expect(policy.policies.length).toBeGreaterThan(0);
  });

  it('evaluates critical finding as fail', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    const findings = [makeFinding('critical')];
    const result = evaluatePolicy(findings, policy);
    expect(result.decision).toBe('fail');
  });

  it('evaluates high finding as fail', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    const findings = [makeFinding('high')];
    const result = evaluatePolicy(findings, policy);
    expect(result.decision).toBe('fail');
  });

  it('evaluates medium finding as warn', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    const findings = [makeFinding('medium')];
    const result = evaluatePolicy(findings, policy);
    expect(result.decision).toBe('warn');
  });

  it('evaluates empty findings as pass', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    const result = evaluatePolicy([], policy);
    expect(result.decision).toBe('pass');
    expect(result.matchedRules).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
  });

  it('evaluatePolicy with critical finding includes log action with interpolated title', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    const findings = [makeFinding('critical', 'SQL Injection')];
    const result = evaluatePolicy(findings, policy);
    const logAction = result.actions.find(a => a.action === 'log');
    expect(logAction).toBeDefined();
    expect(logAction?.message).toBe('Critical finding: SQL Injection');
  });
});
