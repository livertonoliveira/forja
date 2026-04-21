/**
 * Unit tests for MOB-1051 — `migrateLegacyPolicy` in src/policy/dsl/migrator.ts.
 *
 * Tests cover:
 *   - Severity gate when-condition mapping (critical, high, medium, low)
 *   - Action mapping (fail_gate, warn_gate, pass_gate, log, notify_slack)
 *   - Non-portable action http_post: DSL output + Warning emission
 *   - Output format (version: '2', gates: key)
 *   - Error cases (invalid YAML, missing policies key)
 *   - Fallback when key (unknown key uses .is() pattern)
 */

import { describe, it, expect } from 'vitest';
import { migrateLegacyPolicy } from '../migrator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEGACY_CRITICAL = `
version: '1'
policies:
  - name: block-critical
    when:
      finding.severity: critical
    then:
      - action: fail_gate
`.trim();

const LEGACY_HIGH = `
version: '1'
policies:
  - name: block-high
    when:
      finding.severity: high
    then:
      - action: fail_gate
`.trim();

const LEGACY_MEDIUM = `
version: '1'
policies:
  - name: warn-medium
    when:
      finding.severity: medium
    then:
      - action: warn_gate
`.trim();

const LEGACY_LOW = `
version: '1'
policies:
  - name: pass-low
    when:
      finding.severity: low
    then:
      - action: pass_gate
`.trim();

const LEGACY_ALL_ACTIONS = `
version: '1'
policies:
  - name: all-actions
    when:
      finding.severity: critical
    then:
      - action: fail_gate
      - action: warn_gate
      - action: pass_gate
      - action: log
        message: "something happened"
      - action: notify_slack
        channel: "#alerts"
        message: "critical finding detected"
`.trim();

const LEGACY_HTTP_POST = `
version: '1'
policies:
  - name: http-gate
    when:
      finding.severity: high
    then:
      - action: http_post
        url: "https://hooks.example.com/notify"
`.trim();

const LEGACY_FALLBACK_KEY = `
version: '1'
policies:
  - name: custom-gate
    when:
      custom.metric: value
    then:
      - action: pass_gate
`.trim();

const LEGACY_EMPTY_POLICIES = `
version: '1'
policies: []
`.trim();

const LEGACY_MULTIPLE_POLICIES = `
version: '1'
policies:
  - name: gate-critical
    when:
      finding.severity: critical
    then:
      - action: fail_gate
  - name: gate-high
    when:
      finding.severity: high
    then:
      - action: warn_gate
`.trim();

// ---------------------------------------------------------------------------
// Happy path — severity gates
// ---------------------------------------------------------------------------

describe('migrateLegacyPolicy — severity when-condition mapping', () => {
  it('maps finding.severity: critical to findings.countBySeverity("critical") > 0', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_CRITICAL);
    expect(dsl).toContain('findings.countBySeverity("critical") > 0');
  });

  it('maps finding.severity: high to findings.countBySeverity("high") > 0', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_HIGH);
    expect(dsl).toContain('findings.countBySeverity("high") > 0');
  });

  it('maps finding.severity: medium to findings.countBySeverity("medium") > 0', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_MEDIUM);
    expect(dsl).toContain('findings.countBySeverity("medium") > 0');
  });

  it('maps finding.severity: low to findings.countBySeverity("low") > 0', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_LOW);
    expect(dsl).toContain('findings.countBySeverity("low") > 0');
  });
});

// ---------------------------------------------------------------------------
// Happy path — action mapping
// ---------------------------------------------------------------------------

describe('migrateLegacyPolicy — action mapping', () => {
  it('maps fail_gate action to "fail" in then', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_CRITICAL);
    expect(dsl).toContain('fail');
  });

  it('maps warn_gate action to "warn" in then', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_MEDIUM);
    expect(dsl).toContain('warn');
  });

  it('maps pass_gate action to "pass" in then', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_LOW);
    expect(dsl).toContain('pass');
  });

  it('maps log action with message to log("...") in then', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_ALL_ACTIONS);
    expect(dsl).toContain('log("something happened")');
  });

  it('maps notify_slack action with channel and message to notify_slack("channel", "msg") in then', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_ALL_ACTIONS);
    expect(dsl).toContain('notify_slack("#alerts", "critical finding detected")');
  });

  it('outputs all mapped actions in the same gate', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_ALL_ACTIONS);
    expect(dsl).toContain('fail');
    expect(dsl).toContain('warn');
    expect(dsl).toContain('pass');
    expect(dsl).toContain('log("something happened")');
    expect(dsl).toContain('notify_slack("#alerts", "critical finding detected")');
  });
});

// ---------------------------------------------------------------------------
// Non-portable action — http_post
// ---------------------------------------------------------------------------

describe('migrateLegacyPolicy — http_post non-portable action', () => {
  it('produces http_post("url") in the then block', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_HTTP_POST);
    expect(dsl).toContain('http_post("https://hooks.example.com/notify")');
  });

  it('emits a Warning with code "non_portable_action"', () => {
    const { warnings } = migrateLegacyPolicy(LEGACY_HTTP_POST);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('non_portable_action');
  });

  it('Warning contains the gate name', () => {
    const { warnings } = migrateLegacyPolicy(LEGACY_HTTP_POST);
    expect(warnings[0].gate).toBe('http-gate');
  });

  it('Warning message contains the URL', () => {
    const { warnings } = migrateLegacyPolicy(LEGACY_HTTP_POST);
    expect(warnings[0].message).toContain('https://hooks.example.com/notify');
  });

  it('Warning has a non-empty message', () => {
    const { warnings } = migrateLegacyPolicy(LEGACY_HTTP_POST);
    expect(warnings[0].message.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

describe('migrateLegacyPolicy — output format', () => {
  it("output contains version: '2'", () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_CRITICAL);
    expect(dsl).toContain("version: '2'");
  });

  it('output contains "gates:" key', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_CRITICAL);
    expect(dsl).toContain('gates:');
  });

  it('returns empty warnings array when there is no http_post action', () => {
    const { warnings } = migrateLegacyPolicy(LEGACY_CRITICAL);
    expect(warnings).toEqual([]);
  });

  it('preserves gate name in output', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_CRITICAL);
    expect(dsl).toContain('block-critical');
  });

  it('empty policies array produces a DSL with empty gates list', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_EMPTY_POLICIES);
    expect(dsl).toContain('gates:');
    // yaml.dump serializes an empty array as `gates: []\n`
    expect(dsl).toContain('gates: []');
  });

  it('multiple policies produce multiple gates in the output', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_MULTIPLE_POLICIES);
    expect(dsl).toContain('gate-critical');
    expect(dsl).toContain('gate-high');
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('migrateLegacyPolicy — error cases', () => {
  it('throws when YAML is not parseable (syntax error)', () => {
    const invalidYaml = ': : : broken yaml {{{{';
    expect(() => migrateLegacyPolicy(invalidYaml)).toThrow();
  });

  it('throws when YAML is missing the top-level "policies" key', () => {
    const noPolicies = `version: '1'\nwhen:\n  something: else`;
    expect(() => migrateLegacyPolicy(noPolicies)).toThrow();
  });

  it('throws when the YAML root is a plain string', () => {
    expect(() => migrateLegacyPolicy('just a plain string')).toThrow();
  });

  it('throws when the YAML root is null', () => {
    expect(() => migrateLegacyPolicy('~')).toThrow();
  });

  it('throws when "policies" is not an array', () => {
    const notArray = `version: '1'\npolicies:\n  name: single-object`;
    expect(() => migrateLegacyPolicy(notArray)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Fallback when key
// ---------------------------------------------------------------------------

describe('migrateLegacyPolicy — fallback when key', () => {
  it('unknown key falls back to <key>.is("<value>") pattern', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_FALLBACK_KEY);
    expect(dsl).toContain('custom.metric.is("value")');
  });

  it('fallback key does not use findings.countBySeverity', () => {
    const { dsl } = migrateLegacyPolicy(LEGACY_FALLBACK_KEY);
    expect(dsl).not.toContain('countBySeverity');
  });

  it('empty when record maps to "true"', () => {
    const emptyWhen = `
version: '1'
policies:
  - name: always-pass
    when: {}
    then:
      - action: pass_gate
`.trim();
    const { dsl } = migrateLegacyPolicy(emptyWhen);
    expect(dsl).toContain('true');
  });
});
