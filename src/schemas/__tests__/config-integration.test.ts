/**
 * Unit tests for integration config schemas in src/schemas/config.ts — MOB-1083.
 *
 * Tests:
 *  - JiraConfigSchema: valid input passes, missing required fields fail
 *  - GitLabConfigSchema: valid input passes, missing required fields fail
 *  - AzureDevOpsConfigSchema: valid input passes, missing required fields fail
 *  - BitbucketConfigSchema: valid input passes, missing required fields fail
 *  - ConfigSchema: still accepts existing config without integration fields (all optional)
 *  - ConfigSchema: with jira field populated validates correctly
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  JiraConfigSchema,
  GitLabConfigSchema,
  AzureDevOpsConfigSchema,
  BitbucketConfigSchema,
  ConfigSchema,
} from '../config.js';

// ---------------------------------------------------------------------------
// Base ConfigSchema valid payload (no integration fields)
// ---------------------------------------------------------------------------

const BASE_CONFIG = {
  storeUrl: 'https://example.com/store',
  retentionDays: 30,
  phasesDir: './phases',
  logLevel: 'info' as const,
  teamId: 'team-abc',
};

// ---------------------------------------------------------------------------
// JiraConfigSchema
// ---------------------------------------------------------------------------

describe('JiraConfigSchema — valid input', () => {
  it('parses a complete valid Jira config', () => {
    const valid = {
      baseUrl: 'https://acme.atlassian.net',
      email: 'admin@acme.com',
      token: 'jira-token-abc',
      projectKey: 'PROJ',
    };
    expect(() => JiraConfigSchema.parse(valid)).not.toThrow();
  });

  it('returns the parsed values correctly', () => {
    const valid = {
      baseUrl: 'https://acme.atlassian.net',
      email: 'admin@acme.com',
      token: 'secret-token',
      projectKey: 'KEY',
    };
    const result = JiraConfigSchema.parse(valid);
    expect(result.baseUrl).toBe('https://acme.atlassian.net');
    expect(result.email).toBe('admin@acme.com');
    expect(result.token).toBe('secret-token');
    expect(result.projectKey).toBe('KEY');
  });
});

describe('JiraConfigSchema — invalid input', () => {
  it('throws ZodError when baseUrl is not a URL', () => {
    expect(() =>
      JiraConfigSchema.parse({
        baseUrl: 'not-a-url',
        email: 'admin@acme.com',
        token: 'token',
        projectKey: 'PROJ',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when email is invalid', () => {
    expect(() =>
      JiraConfigSchema.parse({
        baseUrl: 'https://acme.atlassian.net',
        email: 'not-an-email',
        token: 'token',
        projectKey: 'PROJ',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when token is empty string', () => {
    expect(() =>
      JiraConfigSchema.parse({
        baseUrl: 'https://acme.atlassian.net',
        email: 'admin@acme.com',
        token: '',
        projectKey: 'PROJ',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when projectKey is empty string', () => {
    expect(() =>
      JiraConfigSchema.parse({
        baseUrl: 'https://acme.atlassian.net',
        email: 'admin@acme.com',
        token: 'token',
        projectKey: '',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => JiraConfigSchema.parse({})).toThrow(z.ZodError);
  });

  it('throws ZodError when token field is missing', () => {
    expect(() =>
      JiraConfigSchema.parse({
        baseUrl: 'https://acme.atlassian.net',
        email: 'admin@acme.com',
        projectKey: 'PROJ',
      }),
    ).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// GitLabConfigSchema
// ---------------------------------------------------------------------------

describe('GitLabConfigSchema — valid input', () => {
  it('parses a complete valid GitLab config', () => {
    const valid = {
      baseUrl: 'https://gitlab.com',
      token: 'glpat-token-xyz',
    };
    expect(() => GitLabConfigSchema.parse(valid)).not.toThrow();
  });

  it('parses a self-hosted GitLab instance', () => {
    const valid = {
      baseUrl: 'https://gitlab.mycompany.com',
      token: 'glpat-private-token',
    };
    const result = GitLabConfigSchema.parse(valid);
    expect(result.baseUrl).toBe('https://gitlab.mycompany.com');
    expect(result.token).toBe('glpat-private-token');
  });
});

describe('GitLabConfigSchema — invalid input', () => {
  it('throws ZodError when baseUrl is not a valid URL', () => {
    expect(() =>
      GitLabConfigSchema.parse({
        baseUrl: 'gitlab.com',
        token: 'token',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when token is empty', () => {
    expect(() =>
      GitLabConfigSchema.parse({
        baseUrl: 'https://gitlab.com',
        token: '',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => GitLabConfigSchema.parse({})).toThrow(z.ZodError);
  });

  it('throws ZodError when token is missing', () => {
    expect(() =>
      GitLabConfigSchema.parse({
        baseUrl: 'https://gitlab.com',
      }),
    ).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// AzureDevOpsConfigSchema
// ---------------------------------------------------------------------------

describe('AzureDevOpsConfigSchema — valid input', () => {
  it('parses a complete valid Azure DevOps config', () => {
    const valid = {
      orgUrl: 'https://dev.azure.com/myorg',
      project: 'my-project',
      token: 'azure-pat-token',
    };
    expect(() => AzureDevOpsConfigSchema.parse(valid)).not.toThrow();
  });

  it('returns the parsed values correctly', () => {
    const valid = {
      orgUrl: 'https://dev.azure.com/acme',
      project: 'backend',
      token: 'pat-secret',
    };
    const result = AzureDevOpsConfigSchema.parse(valid);
    expect(result.orgUrl).toBe('https://dev.azure.com/acme');
    expect(result.project).toBe('backend');
    expect(result.token).toBe('pat-secret');
  });
});

describe('AzureDevOpsConfigSchema — invalid input', () => {
  it('throws ZodError when orgUrl is not a valid URL', () => {
    expect(() =>
      AzureDevOpsConfigSchema.parse({
        orgUrl: 'dev.azure.com/myorg',
        project: 'project',
        token: 'token',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when project is empty string', () => {
    expect(() =>
      AzureDevOpsConfigSchema.parse({
        orgUrl: 'https://dev.azure.com/myorg',
        project: '',
        token: 'token',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when token is empty string', () => {
    expect(() =>
      AzureDevOpsConfigSchema.parse({
        orgUrl: 'https://dev.azure.com/myorg',
        project: 'project',
        token: '',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => AzureDevOpsConfigSchema.parse({})).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// BitbucketConfigSchema
// ---------------------------------------------------------------------------

describe('BitbucketConfigSchema — valid input', () => {
  it('parses a complete valid Bitbucket config', () => {
    const valid = {
      workspace: 'acme-workspace',
      repoSlug: 'my-repo',
      username: 'admin',
      appPassword: 'app-password-secret',
    };
    expect(() => BitbucketConfigSchema.parse(valid)).not.toThrow();
  });

  it('returns the parsed values correctly', () => {
    const valid = {
      workspace: 'ws',
      repoSlug: 'repo',
      username: 'user',
      appPassword: 'pass',
    };
    const result = BitbucketConfigSchema.parse(valid);
    expect(result.workspace).toBe('ws');
    expect(result.repoSlug).toBe('repo');
    expect(result.username).toBe('user');
    expect(result.appPassword).toBe('pass');
  });
});

describe('BitbucketConfigSchema — invalid input', () => {
  it('throws ZodError when workspace is empty string', () => {
    expect(() =>
      BitbucketConfigSchema.parse({
        workspace: '',
        repoSlug: 'repo',
        username: 'user',
        appPassword: 'pass',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when repoSlug is empty string', () => {
    expect(() =>
      BitbucketConfigSchema.parse({
        workspace: 'ws',
        repoSlug: '',
        username: 'user',
        appPassword: 'pass',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when username is empty string', () => {
    expect(() =>
      BitbucketConfigSchema.parse({
        workspace: 'ws',
        repoSlug: 'repo',
        username: '',
        appPassword: 'pass',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when appPassword is empty string', () => {
    expect(() =>
      BitbucketConfigSchema.parse({
        workspace: 'ws',
        repoSlug: 'repo',
        username: 'user',
        appPassword: '',
      }),
    ).toThrow(z.ZodError);
  });

  it('throws ZodError when required fields are missing', () => {
    expect(() => BitbucketConfigSchema.parse({})).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema — integration fields are all optional
// ---------------------------------------------------------------------------

describe('ConfigSchema — integration fields are optional', () => {
  it('parses valid config without any integration fields', () => {
    expect(() => ConfigSchema.parse(BASE_CONFIG)).not.toThrow();
  });

  it('parsed config without integration fields has undefined jira, gitlab, azure, bitbucket', () => {
    const result = ConfigSchema.parse(BASE_CONFIG);
    expect(result.jira).toBeUndefined();
    expect(result.gitlab).toBeUndefined();
    expect(result.azure).toBeUndefined();
    expect(result.bitbucket).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema — with jira field
// ---------------------------------------------------------------------------

describe('ConfigSchema — with jira field', () => {
  it('parses config with a valid jira field', () => {
    const config = {
      ...BASE_CONFIG,
      jira: {
        baseUrl: 'https://acme.atlassian.net',
        email: 'admin@acme.com',
        token: 'jira-token',
        projectKey: 'PROJ',
      },
    };
    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });

  it('retains the jira values after parsing', () => {
    const config = {
      ...BASE_CONFIG,
      jira: {
        baseUrl: 'https://acme.atlassian.net',
        email: 'admin@acme.com',
        token: 'my-token',
        projectKey: 'ABC',
      },
    };
    const result = ConfigSchema.parse(config);
    expect(result.jira).toBeDefined();
    expect(result.jira!.token).toBe('my-token');
    expect(result.jira!.projectKey).toBe('ABC');
  });

  it('throws ZodError when jira field has invalid email', () => {
    const config = {
      ...BASE_CONFIG,
      jira: {
        baseUrl: 'https://acme.atlassian.net',
        email: 'not-an-email',
        token: 'token',
        projectKey: 'PROJ',
      },
    };
    expect(() => ConfigSchema.parse(config)).toThrow(z.ZodError);
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema — with gitlab field
// ---------------------------------------------------------------------------

describe('ConfigSchema — with gitlab field', () => {
  it('parses config with a valid gitlab field', () => {
    const config = {
      ...BASE_CONFIG,
      gitlab: {
        baseUrl: 'https://gitlab.com',
        token: 'glpat-token',
      },
    };
    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema — with azure field
// ---------------------------------------------------------------------------

describe('ConfigSchema — with azure field', () => {
  it('parses config with a valid azure field', () => {
    const config = {
      ...BASE_CONFIG,
      azure: {
        orgUrl: 'https://dev.azure.com/myorg',
        project: 'my-project',
        token: 'pat-token',
      },
    };
    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ConfigSchema — with bitbucket field
// ---------------------------------------------------------------------------

describe('ConfigSchema — with bitbucket field', () => {
  it('parses config with a valid bitbucket field', () => {
    const config = {
      ...BASE_CONFIG,
      bitbucket: {
        workspace: 'acme',
        repoSlug: 'my-repo',
        username: 'admin',
        appPassword: 'app-pass',
      },
    };
    expect(() => ConfigSchema.parse(config)).not.toThrow();
  });
});
