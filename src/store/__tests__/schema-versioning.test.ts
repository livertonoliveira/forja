import { describe, it, expect } from 'vitest';

import { CURRENT_SCHEMA_VERSION, isCompatible, parseSchemaVersion } from '../../schemas/versioning.js';

// ---------------------------------------------------------------------------
// Unit tests for schema versioning logic (no DB required)
// ---------------------------------------------------------------------------

describe('CURRENT_SCHEMA_VERSION', () => {
  it('equals "1.0"', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe('1.0');
  });
});

describe('parseSchemaVersion', () => {
  it('parses valid version strings', () => {
    expect(parseSchemaVersion('1.0')).toEqual({ major: 1, minor: 0 });
    expect(parseSchemaVersion('2.3')).toEqual({ major: 2, minor: 3 });
  });

  it('throws on invalid format', () => {
    expect(() => parseSchemaVersion('1')).toThrow(/Invalid schemaVersion/);
    expect(() => parseSchemaVersion('abc')).toThrow(/Invalid schemaVersion/);
    expect(() => parseSchemaVersion('')).toThrow(/Invalid schemaVersion/);
  });
});

describe('isCompatible', () => {
  it('returns true for same major version', () => {
    expect(isCompatible('1.0', '1.0')).toBe(true);
    expect(isCompatible('1.1', '1.0')).toBe(true);
    expect(isCompatible('1.0', '1.9')).toBe(true);
  });

  it('returns false for different major version', () => {
    expect(isCompatible('2.0', '1.0')).toBe(false);
    expect(isCompatible('1.0', '2.0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertCompatible behavior (mirrors what adapter does at read time)
// ---------------------------------------------------------------------------

function assertCompatible(schemaVersion: string, entity: string): void {
  if (!isCompatible(schemaVersion, CURRENT_SCHEMA_VERSION)) {
    throw new Error(
      `Incompatible schemaVersion "${schemaVersion}" on ${entity} (current: "${CURRENT_SCHEMA_VERSION}"). Major versions must match.`
    );
  }
}

describe('assertCompatible (adapter read guard)', () => {
  it('does not throw for compatible row (schemaVersion = "1.0")', () => {
    expect(() => assertCompatible('1.0', 'Run abc')).not.toThrow();
  });

  it('does not throw for minor bump within same major (schemaVersion = "1.9")', () => {
    expect(() => assertCompatible('1.9', 'Run abc')).not.toThrow();
  });

  it('throws for schemaVersion "2.0" (incompatible major)', () => {
    expect(() => assertCompatible('2.0', 'Run')).toThrow(/Incompatible schemaVersion "2\.0"/);
  });

  it('error message includes entity type', () => {
    expect(() => assertCompatible('2.0', 'Finding')).toThrow(/Finding/);
  });
});

// ---------------------------------------------------------------------------
// Backfill contract: migration default ensures existing rows get '1.0'
// ---------------------------------------------------------------------------

describe('migration backfill contract', () => {
  it('CURRENT_SCHEMA_VERSION is compatible with the migration default "1.0"', () => {
    // The migration sets DEFAULT '1.0'. Any existing row backfilled to '1.0'
    // must be compatible with CURRENT_SCHEMA_VERSION.
    expect(isCompatible('1.0', CURRENT_SCHEMA_VERSION)).toBe(true);
  });
});
