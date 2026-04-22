import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ne } from 'drizzle-orm';

import { PostgresRunner } from '../postgres-runner.js';
import { addField } from '../primitives.js';
import type { Migration } from '../primitives.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const migration09to10: Migration = addField('newField', null, '0.9', '1.0');

// ---------------------------------------------------------------------------
// Imports from drizzle-orm
// ---------------------------------------------------------------------------

describe('drizzle-orm ne import', () => {
  it('ne is a function exported from drizzle-orm', () => {
    expect(typeof ne).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('PostgresRunner constructor', () => {
  it('creates instance with no migrations and empty options', () => {
    const runner = new PostgresRunner([], {});
    expect(runner).toBeInstanceOf(PostgresRunner);
  });

  it('creates instance with dryRun, from, and to options', () => {
    const runner = new PostgresRunner([], { dryRun: true, from: '0.9', to: '1.0' });
    expect(runner).toBeInstanceOf(PostgresRunner);
  });

  it('creates instance with a logger option', () => {
    const runner = new PostgresRunner([], { logger: noopLogger });
    expect(runner).toBeInstanceOf(PostgresRunner);
  });

  it('creates instance with migrations list', () => {
    const runner = new PostgresRunner([migration09to10], {});
    expect(runner).toBeInstanceOf(PostgresRunner);
  });
});

// ---------------------------------------------------------------------------
// kind (protected field exposed via casting)
// ---------------------------------------------------------------------------

describe('PostgresRunner kind', () => {
  it('has kind equal to "postgres"', () => {
    const runner = new PostgresRunner([], {});
    expect((runner as unknown as Record<string, unknown>)['kind']).toBe('postgres');
  });
});

// ---------------------------------------------------------------------------
// plan() — inherited from MigrationRunner
// ---------------------------------------------------------------------------

describe('PostgresRunner plan()', () => {
  it('returns [] when currentVersion equals targetVersion', () => {
    const runner = new PostgresRunner([], {});
    expect(runner.plan('1.0', '1.0')).toEqual([]);
  });

  it('returns the single matching migration when path exists', () => {
    const runner = new PostgresRunner([migration09to10], {});
    const steps = runner.plan('0.9', '1.0');
    expect(steps).toHaveLength(1);
    expect(steps[0]).toBe(migration09to10);
  });

  it('resolves a multi-hop chain', () => {
    const m1: Migration = addField('a', 1, '0.8', '0.9');
    const m2: Migration = addField('b', 2, '0.9', '1.0');
    const runner = new PostgresRunner([m1, m2], {});
    const steps = runner.plan('0.8', '1.0');
    expect(steps).toHaveLength(2);
    expect(steps[0]).toBe(m1);
    expect(steps[1]).toBe(m2);
  });

  it('throws with [postgres] prefix when no migration path exists', () => {
    const runner = new PostgresRunner([], {});
    expect(() => runner.plan('0.9', '1.0')).toThrow(/\[postgres\]/);
  });

  it('throws with the missing version info in message', () => {
    const runner = new PostgresRunner([], {});
    expect(() => runner.plan('0.9', '1.0')).toThrow(/"0\.9"/);
  });
});

// ---------------------------------------------------------------------------
// apply() — error path without a real DB
// ---------------------------------------------------------------------------

describe('PostgresRunner apply()', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws or rejects when called with an invalid connection string', async () => {
    const runner = new PostgresRunner([], {});
    // Attempting to connect to an invalid URL must reject — we catch the error
    // to avoid an unhandled rejection and assert it is an Error instance.
    await expect(
      runner.apply('postgresql://invalid-host-that-does-not-exist:5432/db'),
    ).rejects.toThrow();
  });
});
