import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { writeFile, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { loadToolsPolicy, isToolAllowed } from '../tools-policy.js';
import type { ToolsPolicy } from '../tools-policy.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal policy that mirrors policies/tools.yaml */
const toolsPolicy: ToolsPolicy = {
  version: '1',
  phases: {
    security: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
      allow: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    },
    perf: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
      allow: ['Read', 'Glob', 'Grep'],
    },
    review: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
      allow: ['Read', 'Glob', 'Grep'],
    },
    audit_backend: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
    },
    audit_security: {
      deny: ['Write', 'Edit', 'Bash', 'MultiEdit'],
    },
    develop: {
      allow: '*',
    },
    test: {
      allow: '*',
    },
  },
};

// ---------------------------------------------------------------------------
// isToolAllowed — security phase
// ---------------------------------------------------------------------------
describe('isToolAllowed — security phase', () => {
  it('blocks Edit in security phase (in deny list)', () => {
    expect(isToolAllowed('Edit', 'security', toolsPolicy)).toBe(false);
  });

  it('blocks Write in security phase (in deny list)', () => {
    expect(isToolAllowed('Write', 'security', toolsPolicy)).toBe(false);
  });

  it('blocks Bash in security phase (in deny list)', () => {
    expect(isToolAllowed('Bash', 'security', toolsPolicy)).toBe(false);
  });

  it('allows Read in security phase (in allow list)', () => {
    expect(isToolAllowed('Read', 'security', toolsPolicy)).toBe(true);
  });

  it('allows Grep in security phase (in allow list)', () => {
    expect(isToolAllowed('Grep', 'security', toolsPolicy)).toBe(true);
  });

  it('blocks a tool that is in neither deny nor allow when explicit allow list exists', () => {
    // "Agent" is not in deny nor in the explicit allow list for security
    expect(isToolAllowed('Agent', 'security', toolsPolicy)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isToolAllowed — develop phase (allow: "*")
// ---------------------------------------------------------------------------
describe('isToolAllowed — develop phase (allow: "*")', () => {
  it('allows Edit in develop phase', () => {
    expect(isToolAllowed('Edit', 'develop', toolsPolicy)).toBe(true);
  });

  it('allows Bash in develop phase', () => {
    expect(isToolAllowed('Bash', 'develop', toolsPolicy)).toBe(true);
  });

  it('allows any arbitrary tool in develop phase', () => {
    expect(isToolAllowed('AnyTool', 'develop', toolsPolicy)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isToolAllowed — test phase (allow: "*")
// ---------------------------------------------------------------------------
describe('isToolAllowed — test phase (allow: "*")', () => {
  it('allows Edit in test phase', () => {
    expect(isToolAllowed('Edit', 'test', toolsPolicy)).toBe(true);
  });

  it('allows any tool in test phase', () => {
    expect(isToolAllowed('Write', 'test', toolsPolicy)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isToolAllowed — unknown phase (fail-open)
// ---------------------------------------------------------------------------
describe('isToolAllowed — unknown phase (fail-open)', () => {
  it('returns true for any tool in an unknown phase', () => {
    expect(isToolAllowed('Edit', 'unknown_phase', toolsPolicy)).toBe(true);
  });

  it('returns true for a restricted tool in an unknown phase', () => {
    expect(isToolAllowed('Bash', 'nonexistent', toolsPolicy)).toBe(true);
  });

  it('returns true for any tool when phase is empty string and not defined', () => {
    expect(isToolAllowed('Write', 'staging', toolsPolicy)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isToolAllowed — deny-only phase (no explicit allow list)
// ---------------------------------------------------------------------------
describe('isToolAllowed — deny-only phase (audit_backend)', () => {
  it('blocks Edit in audit_backend phase (in deny list)', () => {
    expect(isToolAllowed('Edit', 'audit_backend', toolsPolicy)).toBe(false);
  });

  it('blocks Bash in audit_backend phase (in deny list)', () => {
    expect(isToolAllowed('Bash', 'audit_backend', toolsPolicy)).toBe(false);
  });

  it('allows Read in audit_backend phase (not in deny, allow is undefined)', () => {
    expect(isToolAllowed('Read', 'audit_backend', toolsPolicy)).toBe(true);
  });

  it('allows any tool not in deny list in audit_backend phase', () => {
    expect(isToolAllowed('Glob', 'audit_backend', toolsPolicy)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isToolAllowed — explicit allow list logic
// ---------------------------------------------------------------------------
describe('isToolAllowed — explicit allow list', () => {
  const strictPolicy: ToolsPolicy = {
    version: '1',
    phases: {
      strict: {
        allow: ['ToolA', 'ToolB'],
      },
    },
  };

  it('allows ToolA when it is in the explicit allow list', () => {
    expect(isToolAllowed('ToolA', 'strict', strictPolicy)).toBe(true);
  });

  it('allows ToolB when it is in the explicit allow list', () => {
    expect(isToolAllowed('ToolB', 'strict', strictPolicy)).toBe(true);
  });

  it('blocks ToolC when it is not in the explicit allow list', () => {
    expect(isToolAllowed('ToolC', 'strict', strictPolicy)).toBe(false);
  });

  it('blocks a tool that is in deny but NOT in allow', () => {
    const denyAndAllow: ToolsPolicy = {
      version: '1',
      phases: {
        mixed: {
          deny: ['DangerousTool'],
          allow: ['SafeTool'],
        },
      },
    };
    expect(isToolAllowed('DangerousTool', 'mixed', denyAndAllow)).toBe(false);
  });

  it('deny takes precedence even if tool appears in both deny and allow', () => {
    const conflicting: ToolsPolicy = {
      version: '1',
      phases: {
        conflicting: {
          deny: ['ToolX'],
          allow: ['ToolX', 'ToolY'],
        },
      },
    };
    // deny is checked before allow, so ToolX should be blocked
    expect(isToolAllowed('ToolX', 'conflicting', conflicting)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadToolsPolicy
// ---------------------------------------------------------------------------
describe('loadToolsPolicy', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `forja-tools-policy-test-${Date.now()}.yaml`);
  });

  afterEach(async () => {
    try {
      await unlink(tmpFile);
    } catch {
      // file may not exist if the test failed before writing
    }
  });

  it('loads and parses a valid YAML tools policy file', async () => {
    const yaml = `
version: "1"
phases:
  security:
    deny: [Write, Edit]
    allow: [Read, Grep]
  develop:
    allow: "*"
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    const policy = await loadToolsPolicy(tmpFile);

    expect(policy.version).toBe('1');
    expect(policy.phases).toHaveProperty('security');
    expect(policy.phases['security'].deny).toEqual(['Write', 'Edit']);
    expect(policy.phases['security'].allow).toEqual(['Read', 'Grep']);
    expect(policy.phases).toHaveProperty('develop');
    expect(policy.phases['develop'].allow).toBe('*');
  });

  it('loads a policy with deny-only phase (no allow)', async () => {
    const yaml = `
version: "1"
phases:
  audit_backend:
    deny: [Write, Edit, Bash]
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    const policy = await loadToolsPolicy(tmpFile);

    expect(policy.phases['audit_backend'].deny).toEqual(['Write', 'Edit', 'Bash']);
    expect(policy.phases['audit_backend'].allow).toBeUndefined();
  });

  it('loads a policy with all phases from policies/tools.yaml structure', async () => {
    const yaml = `
version: "1"
phases:
  security:
    deny: [Write, Edit, Bash, MultiEdit]
    allow: [Read, Glob, Grep, WebSearch, WebFetch]
  perf:
    deny: [Write, Edit, Bash, MultiEdit]
    allow: [Read, Glob, Grep]
  review:
    deny: [Write, Edit, Bash, MultiEdit]
    allow: [Read, Glob, Grep]
  audit_backend:
    deny: [Write, Edit, Bash, MultiEdit]
  audit_security:
    deny: [Write, Edit, Bash, MultiEdit]
  develop:
    allow: "*"
  test:
    allow: "*"
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    const policy = await loadToolsPolicy(tmpFile);

    expect(policy.version).toBe('1');
    expect(Object.keys(policy.phases)).toHaveLength(7);
  });

  it('throws ZodError when version is missing', async () => {
    const yaml = `
phases:
  security:
    deny: [Write]
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    await expect(loadToolsPolicy(tmpFile)).rejects.toThrow(z.ZodError);
  });

  it('throws ZodError when phases is missing', async () => {
    const yaml = `
version: "1"
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    await expect(loadToolsPolicy(tmpFile)).rejects.toThrow(z.ZodError);
  });

  it('throws ZodError when allow has an invalid type (number instead of string or array)', async () => {
    const yaml = `
version: "1"
phases:
  security:
    allow: 42
`;
    await writeFile(tmpFile, yaml, 'utf-8');
    await expect(loadToolsPolicy(tmpFile)).rejects.toThrow(z.ZodError);
  });

  it('throws when the file does not exist', async () => {
    await expect(loadToolsPolicy('/nonexistent/path/tools.yaml')).rejects.toThrow();
  });
});
