/**
 * Unit tests for MOB-1011 — `loadModelsPolicy` and `getModelForPhase` in src/policy/models-policy.ts.
 *
 * Tests cover:
 *   - loadModelsPolicy: valid YAML parses to correct shape
 *   - loadModelsPolicy: unknown model name throws ZodError
 *   - loadModelsPolicy: missing version field throws ZodError
 *   - loadModelsPolicy: missing phases field throws ZodError
 *   - loadModelsPolicy: file not found propagates ENOENT error
 *   - getModelForPhase: returns correct model for known phase
 *   - getModelForPhase: returns undefined for unknown phase
 *   - getModelForPhase: works for all phases in the real policy fixture
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZodError } from 'zod';

// ---------------------------------------------------------------------------
// Mock fs/promises — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockReadFile = vi.fn<(path: string, encoding: string) => Promise<string>>();

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...(args as [string, string])),
}));

// Lazy import after mocks are in place
const { loadModelsPolicy, getModelForPhase } = await import('../../src/policy/models-policy.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_YAML = `
version: "1"
phases:
  spec:     claude-opus-4-7
  develop:  claude-sonnet-4-6
  test:     claude-sonnet-4-6
  perf:     claude-sonnet-4-6
  security: claude-sonnet-4-6
  review:   claude-sonnet-4-6
  homolog:  claude-haiku-4-5
  pr:       claude-haiku-4-5
  audit_backend:   claude-sonnet-4-6
  audit_frontend:  claude-sonnet-4-6
  audit_security:  claude-sonnet-4-6
  audit_database:  claude-sonnet-4-6
`.trim();

const YAML_MISSING_VERSION = `
phases:
  develop: claude-sonnet-4-6
`.trim();

const YAML_MISSING_PHASES = `
version: "1"
`.trim();

const YAML_UNKNOWN_MODEL = `
version: "1"
phases:
  develop: gpt-4-turbo
`.trim();

const YAML_EMPTY_PHASES = `
version: "1"
phases: {}
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedReadFile(content: string): void {
  mockReadFile.mockResolvedValue(content);
}

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadModelsPolicy — happy path
// ---------------------------------------------------------------------------

describe('loadModelsPolicy — happy path', () => {
  it('returns a ModelsPolicy object with correct version', async () => {
    seedReadFile(VALID_YAML);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(policy.version).toBe('1');
  });

  it('returns a ModelsPolicy with spec phase pointing to claude-opus-4-7', async () => {
    seedReadFile(VALID_YAML);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(policy.phases['spec']).toBe('claude-opus-4-7');
  });

  it('returns a ModelsPolicy with develop phase pointing to claude-sonnet-4-6', async () => {
    seedReadFile(VALID_YAML);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(policy.phases['develop']).toBe('claude-sonnet-4-6');
  });

  it('returns a ModelsPolicy with homolog phase pointing to claude-haiku-4-5', async () => {
    seedReadFile(VALID_YAML);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(policy.phases['homolog']).toBe('claude-haiku-4-5');
  });

  it('returns a ModelsPolicy with pr phase pointing to claude-haiku-4-5', async () => {
    seedReadFile(VALID_YAML);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(policy.phases['pr']).toBe('claude-haiku-4-5');
  });

  it('returns a phases record with all 12 defined phases', async () => {
    seedReadFile(VALID_YAML);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(Object.keys(policy.phases)).toHaveLength(12);
  });

  it('passes the correct file path to readFile', async () => {
    seedReadFile(VALID_YAML);
    await loadModelsPolicy('/custom/models.yaml');
    expect(mockReadFile).toHaveBeenCalledWith('/custom/models.yaml', 'utf-8');
  });

  it('accepts claude-haiku-4-5-20251001 as a valid model name', async () => {
    const yaml = `version: "1"\nphases:\n  develop: claude-haiku-4-5-20251001`;
    seedReadFile(yaml);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(policy.phases['develop']).toBe('claude-haiku-4-5-20251001');
  });

  it('allows an empty phases record (no required phases)', async () => {
    seedReadFile(YAML_EMPTY_PHASES);
    const policy = await loadModelsPolicy('/any/path/models.yaml');
    expect(Object.keys(policy.phases)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// loadModelsPolicy — validation errors
// ---------------------------------------------------------------------------

describe('loadModelsPolicy — invalid YAML throws ZodError', () => {
  it('throws ZodError when model name is not in the allowed enum', async () => {
    seedReadFile(YAML_UNKNOWN_MODEL);
    await expect(loadModelsPolicy('/any/path/models.yaml')).rejects.toThrow(ZodError);
  });

  it('throws ZodError when version field is missing', async () => {
    seedReadFile(YAML_MISSING_VERSION);
    await expect(loadModelsPolicy('/any/path/models.yaml')).rejects.toThrow(ZodError);
  });

  it('throws ZodError when phases field is missing', async () => {
    seedReadFile(YAML_MISSING_PHASES);
    await expect(loadModelsPolicy('/any/path/models.yaml')).rejects.toThrow(ZodError);
  });

  it('throws ZodError with issues array describing the bad field', async () => {
    seedReadFile(YAML_UNKNOWN_MODEL);
    const err = await loadModelsPolicy('/any/path/models.yaml').catch((e) => e);
    expect(err).toBeInstanceOf(ZodError);
    expect((err as ZodError).issues.length).toBeGreaterThan(0);
  });

  it('throws ZodError when a phase maps to an integer instead of a string', async () => {
    const yaml = `version: "1"\nphases:\n  develop: 42`;
    seedReadFile(yaml);
    await expect(loadModelsPolicy('/any/path/models.yaml')).rejects.toThrow(ZodError);
  });

  it('throws ZodError when a phase maps to null', async () => {
    const yaml = `version: "1"\nphases:\n  develop: ~`;
    seedReadFile(yaml);
    await expect(loadModelsPolicy('/any/path/models.yaml')).rejects.toThrow(ZodError);
  });

  it('throws ZodError when the entire YAML is a scalar string', async () => {
    seedReadFile('just a string');
    await expect(loadModelsPolicy('/any/path/models.yaml')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadModelsPolicy — I/O errors
// ---------------------------------------------------------------------------

describe('loadModelsPolicy — file I/O errors propagate', () => {
  it('propagates ENOENT error when file does not exist', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }));
    await expect(loadModelsPolicy('/nonexistent/models.yaml')).rejects.toThrow('ENOENT');
  });

  it('propagates EACCES error when file is not readable', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));
    await expect(loadModelsPolicy('/restricted/models.yaml')).rejects.toThrow('EACCES');
  });
});

// ---------------------------------------------------------------------------
// getModelForPhase — happy path
// ---------------------------------------------------------------------------

describe('getModelForPhase — known phases', () => {
  const policy = {
    version: '1',
    phases: {
      spec: 'claude-opus-4-7' as const,
      develop: 'claude-sonnet-4-6' as const,
      test: 'claude-sonnet-4-6' as const,
      homolog: 'claude-haiku-4-5' as const,
      pr: 'claude-haiku-4-5' as const,
    },
  };

  it('returns claude-opus-4-7 for the spec phase', () => {
    expect(getModelForPhase('spec', policy)).toBe('claude-opus-4-7');
  });

  it('returns claude-sonnet-4-6 for the develop phase', () => {
    expect(getModelForPhase('develop', policy)).toBe('claude-sonnet-4-6');
  });

  it('returns claude-sonnet-4-6 for the test phase', () => {
    expect(getModelForPhase('test', policy)).toBe('claude-sonnet-4-6');
  });

  it('returns claude-haiku-4-5 for the homolog phase', () => {
    expect(getModelForPhase('homolog', policy)).toBe('claude-haiku-4-5');
  });

  it('returns claude-haiku-4-5 for the pr phase', () => {
    expect(getModelForPhase('pr', policy)).toBe('claude-haiku-4-5');
  });
});

// ---------------------------------------------------------------------------
// getModelForPhase — unknown phases
// ---------------------------------------------------------------------------

describe('getModelForPhase — unknown phases', () => {
  const policy = {
    version: '1',
    phases: {
      develop: 'claude-sonnet-4-6' as const,
    },
  };

  it('returns undefined for a phase not in the policy', () => {
    expect(getModelForPhase('nonexistent_phase', policy)).toBeUndefined();
  });

  it('returns undefined for an empty string phase', () => {
    expect(getModelForPhase('', policy)).toBeUndefined();
  });

  it('returns undefined when phases record is empty', () => {
    const emptyPolicy = { version: '1', phases: {} };
    expect(getModelForPhase('develop', emptyPolicy)).toBeUndefined();
  });

  it('is case-sensitive: "Develop" is not the same as "develop"', () => {
    expect(getModelForPhase('Develop', policy)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getModelForPhase — return type
// ---------------------------------------------------------------------------

describe('getModelForPhase — return type', () => {
  const policy = {
    version: '1',
    phases: { develop: 'claude-sonnet-4-6' as const },
  };

  it('returns a string when the phase is found', () => {
    const result = getModelForPhase('develop', policy);
    expect(typeof result).toBe('string');
  });

  it('returns undefined (not null, not empty string) when the phase is missing', () => {
    const result = getModelForPhase('missing', policy);
    expect(result).toBeUndefined();
  });
});
