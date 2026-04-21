import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { migrateLegacyPolicy } from '../../../src/policy/dsl/migrator.js';

const LEGACY_DIR = join(process.cwd(), 'tests/fixtures/legacy-policies');
const EXPECTED_DIR = join(process.cwd(), 'tests/fixtures/migrated-policies');

function readFixture(dir: string, name: string): string {
  return readFileSync(join(dir, name), 'utf-8');
}

describe('migrateLegacyPolicy golden tests', () => {
  it('01-severity-gates: migrates severity-based gates correctly', () => {
    const legacy = readFixture(LEGACY_DIR, '01-severity-gates.yaml');
    const expected = readFixture(EXPECTED_DIR, '01-severity-gates.yaml');
    const { dsl, warnings } = migrateLegacyPolicy(legacy);
    expect(dsl).toBe(expected);
    expect(warnings).toHaveLength(0);
  });

  it('02-simple-fail: migrates a single fail gate correctly', () => {
    const legacy = readFixture(LEGACY_DIR, '02-simple-fail.yaml');
    const expected = readFixture(EXPECTED_DIR, '02-simple-fail.yaml');
    const { dsl, warnings } = migrateLegacyPolicy(legacy);
    expect(dsl).toBe(expected);
    expect(warnings).toHaveLength(0);
  });

  it('03-slack-notifications: migrates notify_slack actions correctly', () => {
    const legacy = readFixture(LEGACY_DIR, '03-slack-notifications.yaml');
    const expected = readFixture(EXPECTED_DIR, '03-slack-notifications.yaml');
    const { dsl, warnings } = migrateLegacyPolicy(legacy);
    expect(dsl).toBe(expected);
    expect(warnings).toHaveLength(0);
  });

  it('04-non-portable-action: migrates http_post and emits non_portable_action warning', () => {
    const legacy = readFixture(LEGACY_DIR, '04-non-portable-action.yaml');
    const expected = readFixture(EXPECTED_DIR, '04-non-portable-action.yaml');
    const { dsl, warnings } = migrateLegacyPolicy(legacy);
    expect(dsl).toBe(expected);
    expect(warnings.some((w) => w.code === 'non_portable_action')).toBe(true);
  });

  it('05-multi-action: migrates multiple actions per gate correctly', () => {
    const legacy = readFixture(LEGACY_DIR, '05-multi-action.yaml');
    const expected = readFixture(EXPECTED_DIR, '05-multi-action.yaml');
    const { dsl, warnings } = migrateLegacyPolicy(legacy);
    expect(dsl).toBe(expected);
    expect(warnings).toHaveLength(0);
  });
});

describe('legacy policy loader emits deprecation warning', () => {
  let emitWarningSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { resetDeprecationState } = await import('../../../src/deprecation.js');
    resetDeprecationState();
    emitWarningSpy = vi.spyOn(process, 'emitWarning');
  });

  afterEach(() => {
    emitWarningSpy.mockRestore();
  });

  it('emits DeprecationWarning when loading legacy YAML format', async () => {
    const { loadPolicy } = await import('../../../src/policy/parser.js');

    const fixturePath = join(LEGACY_DIR, '02-simple-fail.yaml');
    await loadPolicy(fixturePath);

    const deprecationCalls = emitWarningSpy.mock.calls.filter(
      (args) => args[1] && typeof args[1] === 'object' && (args[1] as { type?: string }).type === 'DeprecationWarning',
    );
    expect(deprecationCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('emits DeprecationWarning only once for repeated calls (deduplication)', async () => {
    const { loadPolicy } = await import('../../../src/policy/parser.js');

    const fixturePath = join(LEGACY_DIR, '02-simple-fail.yaml');
    await loadPolicy(fixturePath);
    await loadPolicy(fixturePath);
    await loadPolicy(fixturePath);

    const deprecationCalls = emitWarningSpy.mock.calls.filter(
      (args) => args[1] && typeof args[1] === 'object' && (args[1] as { type?: string }).type === 'DeprecationWarning',
    );
    // warnDeprecated deduplicates by name — only 1 warning emitted
    expect(deprecationCalls).toHaveLength(1);
  });

  it('does not emit DeprecationWarning when FORJA_SUPPRESS_DEPRECATION_WARNINGS=1', async () => {
    const original = process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS;
    process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS = '1';

    try {
      const { loadPolicy } = await import('../../../src/policy/parser.js');

      const fixturePath = join(LEGACY_DIR, '02-simple-fail.yaml');
      await loadPolicy(fixturePath);
    } finally {
      if (original === undefined) {
        delete process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS;
      } else {
        process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS = original;
      }
    }

    const deprecationCalls = emitWarningSpy.mock.calls.filter(
      (args) => args[1] && typeof args[1] === 'object' && (args[1] as { type?: string }).type === 'DeprecationWarning',
    );
    expect(deprecationCalls).toHaveLength(0);
  });
});
