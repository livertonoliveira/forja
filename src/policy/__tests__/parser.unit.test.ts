import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { PolicyFileSchema, loadPolicy } from '../parser.js';

// ---------------------------------------------------------------------------
// PolicyFileSchema
// ---------------------------------------------------------------------------
describe('PolicyFileSchema', () => {
  it('parses a valid policy object', () => {
    const valid = {
      version: '1',
      policies: [
        {
          name: 'gate-critical',
          when: { 'finding.severity': 'critical' },
          then: [{ action: 'fail_gate' }],
        },
      ],
    };
    expect(() => PolicyFileSchema.parse(valid)).not.toThrow();
  });

  it('parses a policy with all supported action types', () => {
    const valid = {
      version: '1',
      policies: [
        {
          name: 'all-actions',
          when: { 'finding.severity': 'high' },
          then: [
            { action: 'fail_gate' },
            { action: 'warn_gate' },
            { action: 'pass_gate' },
            { action: 'log', message: 'found: {{finding.title}}' },
            { action: 'http_post', url: 'https://example.com/hook' },
            { action: 'notify_slack', message: 'alert' },
          ],
        },
      ],
    };
    expect(() => PolicyFileSchema.parse(valid)).not.toThrow();
  });

  it('parses a policy with an empty policies array', () => {
    const valid = { version: '1', policies: [] };
    expect(() => PolicyFileSchema.parse(valid)).not.toThrow();
  });

  it('throws ZodError when version is missing', () => {
    const invalid = {
      policies: [
        {
          name: 'rule',
          when: { 'finding.severity': 'low' },
          then: [{ action: 'pass_gate' }],
        },
      ],
    };
    expect(() => PolicyFileSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('throws ZodError when policies array is missing', () => {
    const invalid = { version: '1' };
    expect(() => PolicyFileSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('throws ZodError when action enum value is invalid', () => {
    const invalid = {
      version: '1',
      policies: [
        {
          name: 'rule',
          when: { 'finding.severity': 'critical' },
          then: [{ action: 'explode' }],
        },
      ],
    };
    expect(() => PolicyFileSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('throws ZodError when a rule is missing the name field', () => {
    const invalid = {
      version: '1',
      policies: [
        {
          when: { 'finding.severity': 'low' },
          then: [{ action: 'pass_gate' }],
        },
      ],
    };
    expect(() => PolicyFileSchema.parse(invalid)).toThrow(z.ZodError);
  });

  it('throws ZodError when then array is missing', () => {
    const invalid = {
      version: '1',
      policies: [
        {
          name: 'rule',
          when: { 'finding.severity': 'low' },
        },
      ],
    };
    expect(() => PolicyFileSchema.parse(invalid)).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// loadPolicy
// ---------------------------------------------------------------------------
describe('loadPolicy', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `forja-policy-test-${Date.now()}.yaml`);
  });

  afterEach(async () => {
    try {
      await unlink(tmpFile);
    } catch {
      // file may not exist if the test failed before writing
    }
  });

  it('loads and parses a valid YAML policy file', async () => {
    const yaml = `
version: "1"
policies:
  - name: gate-critical
    when:
      finding.severity: critical
    then:
      - action: fail_gate
      - action: log
        message: "Critical: {{finding.title}}"
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    const policy = await loadPolicy(tmpFile);

    expect(policy.version).toBe('1');
    expect(policy.policies).toHaveLength(1);
    expect(policy.policies[0].name).toBe('gate-critical');
    expect(policy.policies[0].then[0].action).toBe('fail_gate');
    expect(policy.policies[0].then[1].action).toBe('log');
    expect(policy.policies[0].then[1].message).toBe('Critical: {{finding.title}}');
  });

  it('returns a PolicyFile with multiple rules', async () => {
    const yaml = `
version: "2"
policies:
  - name: rule-a
    when:
      finding.severity: high
    then:
      - action: fail_gate
  - name: rule-b
    when:
      finding.severity: low
    then:
      - action: pass_gate
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    const policy = await loadPolicy(tmpFile);

    expect(policy.version).toBe('2');
    expect(policy.policies).toHaveLength(2);
    expect(policy.policies[1].name).toBe('rule-b');
  });

  it('throws ZodError when YAML is missing version', async () => {
    const yaml = `
policies:
  - name: rule
    when:
      finding.severity: low
    then:
      - action: pass_gate
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    await expect(loadPolicy(tmpFile)).rejects.toThrow(z.ZodError);
  });

  it('throws ZodError when YAML contains an invalid action enum', async () => {
    const yaml = `
version: "1"
policies:
  - name: bad-rule
    when:
      finding.severity: critical
    then:
      - action: unknown_action
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    await expect(loadPolicy(tmpFile)).rejects.toThrow(z.ZodError);
  });

  it('throws when the file does not exist', async () => {
    await expect(loadPolicy('/nonexistent/path/policy.yaml')).rejects.toThrow();
  });
});
