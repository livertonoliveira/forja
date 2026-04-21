import { describe, it, expect } from 'vitest';
import { detectBreakingChanges } from '../scripts/check-breaking-changes.js';
import type { JsonSchema } from '../scripts/check-breaking-changes.js';

// ---------------------------------------------------------------------------
// Helpers to build minimal JSON Schema objects compatible with the format
// produced by zod-to-json-schema (direct objects, no definitions wrapper).
// ---------------------------------------------------------------------------

function makeObjectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function makeStringProp(): JsonSchema {
  return { type: 'string' };
}

function makeEnumProp(values: string[]): JsonSchema {
  return { type: 'string', enum: values };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectBreakingChanges', () => {
  // 1. No change — identical baseline and current → 0 breaking changes
  it('returns no findings when baseline and current are identical', () => {
    const schema = makeObjectSchema(
      { id: makeStringProp(), name: makeStringProp() },
      ['id', 'name'],
    );
    const baseline: Record<string, JsonSchema> = { MySchema: schema };
    const current: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema(
        { id: makeStringProp(), name: makeStringProp() },
        ['id', 'name'],
      ),
    };

    const findings = detectBreakingChanges(baseline, current);
    expect(findings).toHaveLength(0);
  });

  // 2. Add optional field — non-breaking
  it('returns no findings when an optional field is added', () => {
    const baseline: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema({ id: makeStringProp() }, ['id']),
    };
    const current: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema(
        { id: makeStringProp(), description: makeStringProp() },
        ['id'], // description is optional (not in required)
      ),
    };

    const findings = detectBreakingChanges(baseline, current);
    expect(findings).toHaveLength(0);
  });

  // 3. Remove required field → field_removed breaking change
  it('detects field_removed when a required property is removed', () => {
    const baseline: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema(
        { id: makeStringProp(), title: makeStringProp() },
        ['id', 'title'],
      ),
    };
    const current: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema({ id: makeStringProp() }, ['id']),
    };

    const findings = detectBreakingChanges(baseline, current);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain('field_removed');
    const removed = findings.find((f) => f.kind === 'field_removed');
    expect(removed?.schema).toBe('MySchema');
    expect(removed?.path).toContain('title');
  });

  // 4. Enum value removed → enum_value_removed breaking change
  it('detects enum_value_removed when an enum value is removed', () => {
    const baseline: Record<string, JsonSchema> = {
      StatusSchema: makeEnumProp(['active', 'inactive', 'pending']),
    };
    const current: Record<string, JsonSchema> = {
      StatusSchema: makeEnumProp(['active', 'inactive']),
    };

    const findings = detectBreakingChanges(baseline, current);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain('enum_value_removed');
    const removed = findings.find(
      (f) => f.kind === 'enum_value_removed' && f.details.includes('pending'),
    );
    expect(removed).toBeDefined();
  });

  // 5. Schema removed → schema_removed breaking change
  it('detects schema_removed when a schema disappears from current', () => {
    const baseline: Record<string, JsonSchema> = {
      OldSchema: makeObjectSchema({ id: makeStringProp() }, ['id']),
      KeepSchema: makeObjectSchema({ id: makeStringProp() }, ['id']),
    };
    const current: Record<string, JsonSchema> = {
      KeepSchema: makeObjectSchema({ id: makeStringProp() }, ['id']),
    };

    const findings = detectBreakingChanges(baseline, current);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain('schema_removed');
    const removed = findings.find((f) => f.kind === 'schema_removed');
    expect(removed?.schema).toBe('OldSchema');
  });

  // 6. Field made required — optional → required is breaking
  it('detects field_made_required when an optional field becomes required', () => {
    const baseline: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema(
        { id: makeStringProp(), note: makeStringProp() },
        ['id'], // note is optional
      ),
    };
    const current: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema(
        { id: makeStringProp(), note: makeStringProp() },
        ['id', 'note'], // note is now required
      ),
    };

    const findings = detectBreakingChanges(baseline, current);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain('field_made_required');
    const finding = findings.find((f) => f.kind === 'field_made_required');
    expect(finding?.schema).toBe('MySchema');
    expect(finding?.path).toContain('note');
  });

  // 7. Stricter string constraint — adding minLength > 0 is breaking
  it('detects constraint_stricter when minLength is added to a string field', () => {
    const baseline: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema(
        { id: makeStringProp(), name: { type: 'string' } },
        ['id', 'name'],
      ),
    };
    const current: Record<string, JsonSchema> = {
      MySchema: makeObjectSchema(
        { id: makeStringProp(), name: { type: 'string', minLength: 3 } },
        ['id', 'name'],
      ),
    };

    const findings = detectBreakingChanges(baseline, current);
    const kinds = findings.map((f) => f.kind);
    expect(kinds).toContain('constraint_stricter');
    const finding = findings.find((f) => f.kind === 'constraint_stricter');
    expect(finding?.schema).toBe('MySchema');
    expect(finding?.details).toMatch(/minLength/);
  });
});
