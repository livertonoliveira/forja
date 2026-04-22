import { describe, it, expect } from 'vitest';

import {
  addField,
  renameField,
  removeField,
  transformPayload,
  composeMigrations,
} from '../primitives.js';
import type { MigrationContext } from '../primitives.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function ctx(payload: unknown, fromVersion = '1.0', toVersion = '2.0'): MigrationContext {
  return {
    from: { schemaVersion: fromVersion, payload },
    to: { schemaVersion: toVersion },
    logger: noopLogger,
  };
}

// ---------------------------------------------------------------------------
// addField
// ---------------------------------------------------------------------------

describe('addField', () => {
  it('adds the field with defaultValue when absent', () => {
    const migration = addField('active', true, '1.0', '2.0');
    const result = migration.apply(ctx({ id: '1' }));
    expect(result).toEqual({ id: '1', active: true });
  });

  it('leaves field unchanged when it already exists (idempotent on field)', () => {
    const migration = addField('active', true, '1.0', '2.0');
    const result = migration.apply(ctx({ id: '1', active: false }));
    expect(result).toEqual({ id: '1', active: false });
  });

  it('throws when payload is not a plain object (null)', () => {
    const migration = addField('x', 0, '1.0', '2.0');
    expect(() => migration.apply(ctx(null))).toThrow(/payload must be a plain object/);
  });

  it('throws when payload is not a plain object (array)', () => {
    const migration = addField('x', 0, '1.0', '2.0');
    expect(() => migration.apply(ctx([1, 2, 3]))).toThrow(/payload must be a plain object/);
  });

  it('throws when payload is a primitive', () => {
    const migration = addField('x', 0, '1.0', '2.0');
    expect(() => migration.apply(ctx('string'))).toThrow(/payload must be a plain object/);
  });

  it('returns payload unchanged when already at target version (version idempotence)', () => {
    const migration = addField('active', true, '1.0', '2.0');
    const payload = { id: '1' };
    const result = migration.apply(ctx(payload, '2.0', '2.0'));
    expect(result).toBe(payload);
  });
});

// ---------------------------------------------------------------------------
// renameField
// ---------------------------------------------------------------------------

describe('renameField', () => {
  it('renames oldName to newName', () => {
    const migration = renameField('name', 'displayName', '1.0', '2.0');
    const result = migration.apply(ctx({ id: '1', name: 'Alice' }));
    expect(result).toEqual({ id: '1', displayName: 'Alice' });
  });

  it('removes oldName from the output', () => {
    const migration = renameField('name', 'displayName', '1.0', '2.0');
    const result = migration.apply(ctx({ id: '1', name: 'Alice' })) as Record<string, unknown>;
    expect(result).not.toHaveProperty('name');
  });

  it('throws when both oldName and newName are absent', () => {
    const migration = renameField('missing', 'alsoMissing', '1.0', '2.0');
    expect(() => migration.apply(ctx({ id: '1' }))).toThrow(/renameField/);
    expect(() => migration.apply(ctx({ id: '1' }))).toThrow(/"missing"/);
  });

  it('returns payload unchanged when newName exists and oldName is absent (already renamed)', () => {
    const migration = renameField('name', 'displayName', '1.0', '2.0');
    const payload = { id: '1', displayName: 'Alice' };
    const result = migration.apply(ctx(payload));
    expect(result).toEqual(payload);
  });

  it('warns and overwrites newName when both oldName and newName coexist', () => {
    const warns: string[] = [];
    const warnLogger = { ...noopLogger, warn: (msg: string) => warns.push(msg) };
    const migration = renameField('name', 'displayName', '1.0', '2.0');
    const result = migration.apply({
      from: { schemaVersion: '1.0', payload: { id: '1', name: 'Alice', displayName: 'Old' } },
      to: { schemaVersion: '2.0' },
      logger: warnLogger,
    });
    expect(result).toEqual({ id: '1', displayName: 'Alice' });
    expect(warns.length).toBe(1);
    expect(warns[0]).toMatch(/both "name" and "displayName" exist/);
  });

  it('returns payload unchanged when already at target version (version idempotence)', () => {
    const migration = renameField('name', 'displayName', '1.0', '2.0');
    const payload = { id: '1', name: 'Alice' };
    const result = migration.apply(ctx(payload, '2.0', '2.0'));
    expect(result).toBe(payload);
  });
});

// ---------------------------------------------------------------------------
// removeField
// ---------------------------------------------------------------------------

describe('removeField', () => {
  it('removes the field from the payload', () => {
    const migration = removeField('legacy', '1.0', '2.0');
    const result = migration.apply(ctx({ id: '1', legacy: 'old' }));
    expect(result).toEqual({ id: '1' });
    expect(result as Record<string, unknown>).not.toHaveProperty('legacy');
  });

  it('proceeds silently when the field does not exist', () => {
    const migration = removeField('legacy', '1.0', '2.0');
    const result = migration.apply(ctx({ id: '1' }));
    expect(result).toEqual({ id: '1' });
  });

  it('returns payload unchanged when already at target version (version idempotence)', () => {
    const migration = removeField('legacy', '1.0', '2.0');
    const payload = { id: '1', legacy: 'old' };
    const result = migration.apply(ctx(payload, '2.0', '2.0'));
    expect(result).toBe(payload);
  });
});

// ---------------------------------------------------------------------------
// transformPayload
// ---------------------------------------------------------------------------

describe('transformPayload', () => {
  it('applies the transformation function to the payload', () => {
    const migration = transformPayload(
      (p) => ({ ...(p as Record<string, unknown>), transformed: true }),
      '1.0',
      '2.0'
    );
    const result = migration.apply(ctx({ id: '1' }));
    expect(result).toEqual({ id: '1', transformed: true });
  });

  it('fn receives the full payload', () => {
    const received: unknown[] = [];
    const migration = transformPayload((p) => { received.push(p); return p; }, '1.0', '2.0');
    const payload = { id: '1', x: 42 };
    migration.apply(ctx(payload));
    expect(received[0]).toBe(payload);
  });

  it('returns payload unchanged when already at target version (version idempotence)', () => {
    const migration = transformPayload((p) => ({ ...(p as object), mutated: true }), '1.0', '2.0');
    const payload = { id: '1' };
    const result = migration.apply(ctx(payload, '2.0', '2.0'));
    expect(result).toBe(payload);
  });
});

// ---------------------------------------------------------------------------
// composeMigrations
// ---------------------------------------------------------------------------

describe('composeMigrations', () => {
  it('produces the correct result for a 3-step pipeline', () => {
    const m1 = addField('step1', true, '1.0', '1.1');
    const m2 = addField('step2', 42, '1.1', '1.2');
    const m3 = renameField('step1', 'renamedStep1', '1.2', '2.0');
    const composed = composeMigrations(m1, m2, m3);

    expect(composed.from).toBe('1.0');
    expect(composed.to).toBe('2.0');

    const result = composed.apply(ctx({ id: 'x' }, '1.0', '2.0'));
    expect(result).toEqual({ id: 'x', renamedStep1: true, step2: 42 });
  });

  it('throws on incompatible adjacent migrations', () => {
    const m1 = addField('a', 1, '1.0', '1.1');
    const m2 = addField('b', 2, '2.0', '2.1');
    expect(() => composeMigrations(m1, m2)).toThrow(/incompatible adjacent migrations/);
    expect(() => composeMigrations(m1, m2)).toThrow(/"1.1"/);
  });

  it('throws when migrations array is empty', () => {
    expect(() => composeMigrations()).toThrow(/must not be empty/);
  });

  it('returns payload unchanged when already at target version (version idempotence)', () => {
    const m1 = addField('a', 1, '1.0', '1.1');
    const m2 = addField('b', 2, '1.1', '2.0');
    const composed = composeMigrations(m1, m2);
    const payload = { id: 'x' };
    const result = composed.apply(ctx(payload, '2.0', '2.0'));
    expect(result).toBe(payload);
  });

  it('skips already-applied sub-migrations when starting from an intermediate version', () => {
    const m1 = addField('step1', true, '1.0', '1.1');
    const m2 = addField('step2', 42, '1.1', '2.0');
    const composed = composeMigrations(m1, m2);
    const result = composed.apply(ctx({ id: 'x', step1: true }, '1.1', '2.0'));
    expect(result).toEqual({ id: 'x', step1: true, step2: 42 });
  });

  it('describe returns all steps joined', () => {
    const m1 = addField('a', 1, '1.0', '1.1');
    const m2 = addField('b', 2, '1.1', '2.0');
    const composed = composeMigrations(m1, m2);
    const desc = composed.describe();
    expect(desc).toContain(m1.describe());
    expect(desc).toContain(m2.describe());
    expect(desc).toContain(' → ');
  });
});
