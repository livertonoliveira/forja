import { describe, it, expect, vi } from 'vitest';

import { MigrationRunner } from '../runner.js';
import { registry } from '../registry.js';
import { addField, transformPayload } from '../primitives.js';
import type { Migration, MigrationContext } from '../primitives.js';
import type { Logger } from '../../../plugin/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Concrete subclass that exposes `runSteps` for unit testing (it is protected
 * on the base class) and overrides `apply` so the base class does not throw.
 */
class TestRunner<T> extends MigrationRunner<T> {
  async runStepsPublic(
    payload: unknown,
    fromVersion: string,
    toVersion: string,
    logger: Logger,
  ): Promise<unknown> {
    return this.runSteps(payload, fromVersion, toVersion, logger);
  }

  override async apply(input: T): Promise<T> {
    return input;
  }
}

// ---------------------------------------------------------------------------
// plan()
// ---------------------------------------------------------------------------

describe('MigrationRunner.plan()', () => {
  it('returns empty array when currentVersion === targetVersion', () => {
    const runner = new TestRunner<unknown>([], 'trace');
    expect(runner.plan('1.0', '1.0')).toEqual([]);
  });

  it('returns the single migration for a one-step path', () => {
    const m = addField('active', true, '1.0', '1.1');
    const runner = new TestRunner<unknown>([m], 'trace');
    const plan = runner.plan('1.0', '1.1');
    expect(plan).toHaveLength(1);
    expect(plan[0]).toBe(m);
  });

  it('returns both migrations in order for a two-step chain', () => {
    const m1 = addField('active', true, '1.0', '1.1');
    const m2 = addField('count', 0, '1.1', '1.2');
    const runner = new TestRunner<unknown>([m1, m2], 'report');
    const plan = runner.plan('1.0', '1.2');
    expect(plan).toHaveLength(2);
    expect(plan[0]).toBe(m1);
    expect(plan[1]).toBe(m2);
  });

  it('throws with kind name when no path exists', () => {
    const m = addField('active', true, '1.0', '1.1');
    const runner = new TestRunner<unknown>([m], 'postgres');
    expect(() => runner.plan('1.0', '9.9')).toThrow(/\[postgres\]/);
    expect(() => runner.plan('1.0', '9.9')).toThrow(/No migration found/);
  });

  it('throws with kind name on cycle detection', () => {
    // Build a cycle: 1.0 → 1.1 → 1.2 → 1.1 (infinite loop)
    // We need more migrations than this.migrations.length + 1 iterations,
    // so we create a 2-migration registry that forms a cycle.
    const cyclicMigrations: Migration[] = [
      {
        from: '1.0',
        to: '1.1',
        apply: (ctx: MigrationContext) => ctx.from.payload,
        describe: () => 'step 1.0→1.1',
      },
      {
        from: '1.1',
        to: '1.0',
        apply: (ctx: MigrationContext) => ctx.from.payload,
        describe: () => 'step 1.1→1.0',
      },
    ];
    const runner = new TestRunner<unknown>(cyclicMigrations, 'trace');
    // Asking for '1.2' will keep looping 1.0 → 1.1 → 1.0 → … until the
    // cycle guard triggers.
    expect(() => runner.plan('1.0', '1.2')).toThrow(/\[trace\]/);
    expect(() => runner.plan('1.0', '1.2')).toThrow(/cycle detected/);
  });
});

// ---------------------------------------------------------------------------
// runSteps()
// ---------------------------------------------------------------------------

describe('MigrationRunner.runSteps()', () => {
  it('applies migrations to the payload in order', async () => {
    const m1 = addField('step1', true, '1.0', '1.1');
    const m2 = transformPayload(
      (p) => ({ ...(p as Record<string, unknown>), step2: 42 }),
      '1.1',
      '1.2',
    );
    const runner = new TestRunner<unknown>([m1, m2], 'trace');

    const result = await runner.runStepsPublic(
      { id: 'x' },
      '1.0',
      '1.2',
      noopLogger,
    );

    expect(result).toEqual({ id: 'x', step1: true, step2: 42 });
  });

  it('logs via logger.error and rethrows with "[kind] Migration aborted" on migration error', async () => {
    const faultyMigration: Migration = {
      from: '1.0',
      to: '1.1',
      apply: () => {
        throw new Error('something went wrong');
      },
      describe: () => 'faulty step [1.0 → 1.1]',
    };

    const errors: string[] = [];
    const spyLogger: Logger = {
      info: () => {},
      warn: () => {},
      error: (msg: string) => errors.push(msg),
    };

    const runner = new TestRunner<unknown>([faultyMigration], 'report');

    await expect(
      runner.runStepsPublic({ id: 'x' }, '1.0', '1.1', spyLogger),
    ).rejects.toThrow(/\[report\] Migration aborted/);

    // logger.error must have been called at least once
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/\[report\] Migration failed/);
    expect(errors[0]).toMatch(/something went wrong/);
  });
});

// ---------------------------------------------------------------------------
// apply()
// ---------------------------------------------------------------------------

describe('MigrationRunner.apply()', () => {
  it('returns input from concrete subclass override', async () => {
    const runner = new TestRunner<unknown>([], 'trace');
    const input = { id: 'x' };
    const result = await runner.apply(input);
    expect(result).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

describe('registry', () => {
  it('is an array', () => {
    expect(Array.isArray(registry)).toBe(true);
  });

  it('is currently empty (no migrations needed yet)', () => {
    expect(registry).toHaveLength(0);
  });
});
