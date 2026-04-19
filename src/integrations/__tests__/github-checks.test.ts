/**
 * Unit tests for src/integrations/github-checks.ts — MOB-1016.
 *
 * Tests:
 *  - parseGitRemote: SSH and HTTPS URL parsing, non-GitHub hosts, edge cases
 *  - createCheck: fetch called with correct payload, GITHUB_TOKEN handling,
 *    details_url inclusion/omission
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import { parseGitRemote, createCheck } from '../github-checks.js';
import { loadConfig } from '../../config/loader.js';

const mockedLoadConfig = vi.mocked(loadConfig);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv(): void {
  delete process.env.GITHUB_TOKEN;
}

// ---------------------------------------------------------------------------
// parseGitRemote
// ---------------------------------------------------------------------------

describe('parseGitRemote — SSH URLs', () => {
  it('parses SSH URL with .git suffix', () => {
    const result = parseGitRemote('git@github.com:acme/my-repo.git');
    expect(result).toEqual({ owner: 'acme', repo: 'my-repo' });
  });

  it('parses SSH URL without .git suffix', () => {
    const result = parseGitRemote('git@github.com:acme/my-repo');
    expect(result).toEqual({ owner: 'acme', repo: 'my-repo' });
  });

  it('extracts owner and repo correctly from SSH URL', () => {
    const result = parseGitRemote('git@github.com:some-org/cool-project.git');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('some-org');
    expect(result!.repo).toBe('cool-project');
  });
});

describe('parseGitRemote — HTTPS URLs', () => {
  it('parses HTTPS URL with .git suffix', () => {
    const result = parseGitRemote('https://github.com/acme/my-repo.git');
    expect(result).toEqual({ owner: 'acme', repo: 'my-repo' });
  });

  it('parses HTTPS URL without .git suffix', () => {
    const result = parseGitRemote('https://github.com/acme/my-repo');
    expect(result).toEqual({ owner: 'acme', repo: 'my-repo' });
  });

  it('extracts owner and repo correctly from HTTPS URL', () => {
    const result = parseGitRemote('https://github.com/my-company/awesome-lib.git');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('my-company');
    expect(result!.repo).toBe('awesome-lib');
  });
});

describe('parseGitRemote — non-GitHub hosts', () => {
  it('returns null for GitLab SSH URL', () => {
    const result = parseGitRemote('git@gitlab.com:acme/repo.git');
    expect(result).toBeNull();
  });

  it('returns null for Bitbucket HTTPS URL', () => {
    const result = parseGitRemote('https://bitbucket.org/acme/repo.git');
    expect(result).toBeNull();
  });
});

describe('parseGitRemote — edge cases', () => {
  it('returns null for empty string', () => {
    const result = parseGitRemote('');
    expect(result).toBeNull();
  });

  it('returns null for arbitrary non-URL string', () => {
    const result = parseGitRemote('not-a-url');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createCheck
// ---------------------------------------------------------------------------

describe('createCheck — GITHUB_TOKEN from environment', () => {
  let fetchSpy: MockInstance<Parameters<typeof fetch>, ReturnType<typeof fetch>>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    setEnv({ GITHUB_TOKEN: 'ghp_test_token' });
    // loadConfig merges process.env.GITHUB_TOKEN internally, so the mock must
    // return what the real implementation would return when the env var is set.
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://localhost/forja',
      retentionDays: 90,
      githubToken: 'ghp_test_token',
      source: 'default',
    });
  });

  afterEach(() => {
    clearEnv();
    vi.clearAllMocks();
  });

  it('calls fetch with the correct GitHub Checks API URL', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'abc123abc123abc123abc123abc123abc123abc1',
      name: 'forja / quality',
      conclusion: 'success',
      title: 'All checks passed',
      summary: 'No issues found',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/acme/my-repo/check-runs');
  });

  it('sends POST with Authorization Bearer header', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'abc123abc123abc123abc123abc123abc123abc1',
      name: 'forja / quality',
      conclusion: 'success',
      title: 'All checks passed',
      summary: 'No issues found',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer ghp_test_token');
    expect((init.headers as Record<string, string>)['Accept']).toBe('application/vnd.github+json');
  });

  it('sends body with correct name, head_sha, status, conclusion, output.title, output.summary', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      name: 'forja / quality',
      conclusion: 'failure',
      title: 'Quality gate failed',
      summary: '3 issues found',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.name).toBe('forja / quality');
    expect(body.head_sha).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(body.status).toBe('completed');
    expect(body.conclusion).toBe('failure');
    expect(body.output.title).toBe('Quality gate failed');
    expect(body.output.summary).toBe('3 issues found');
  });

  it('includes details_url in body when detailsUrl is provided', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'abc123abc123abc123abc123abc123abc123abc1',
      name: 'forja / quality',
      conclusion: 'success',
      title: 'All checks passed',
      summary: 'No issues found',
      detailsUrl: 'https://example.com/run/42',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.details_url).toBe('https://example.com/run/42');
  });

  it('omits details_url from body when detailsUrl is not provided', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'abc123abc123abc123abc123abc123abc123abc1',
      name: 'forja / quality',
      conclusion: 'neutral',
      title: 'Checks skipped',
      summary: 'Nothing to check',
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body).not.toHaveProperty('details_url');
  });
});

describe('createCheck — GITHUB_TOKEN from config', () => {
  let fetchSpy: MockInstance<Parameters<typeof fetch>, ReturnType<typeof fetch>>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    // No env token
    clearEnv();
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://localhost/forja',
      retentionDays: 90,
      githubToken: 'ghp_config_token',
      source: 'project-file',
    });
  });

  afterEach(() => {
    clearEnv();
    vi.clearAllMocks();
  });

  it('uses token from config when GITHUB_TOKEN env var is not set', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'abc123abc123abc123abc123abc123abc123abc1',
      name: 'forja / quality',
      conclusion: 'success',
      title: 'Passed',
      summary: 'OK',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer ghp_config_token');
  });
});

describe('createCheck — no token available', () => {
  let fetchSpy: MockInstance<Parameters<typeof fetch>, ReturnType<typeof fetch>>;
  let warnSpy: MockInstance<Parameters<typeof console.warn>, void>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    clearEnv();
    // Config also has no token
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://localhost/forja',
      retentionDays: 90,
      githubToken: undefined,
      source: 'default',
    });
  });

  afterEach(() => {
    clearEnv();
    vi.clearAllMocks();
  });

  it('does NOT call fetch when no token is available', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'abc123abc123abc123abc123abc123abc123abc1',
      name: 'forja / quality',
      conclusion: 'success',
      title: 'Passed',
      summary: 'OK',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('logs a warning when no token is available', async () => {
    await createCheck({
      owner: 'acme',
      repo: 'my-repo',
      sha: 'abc123abc123abc123abc123abc123abc123abc1',
      name: 'forja / quality',
      conclusion: 'success',
      title: 'Passed',
      summary: 'OK',
    });

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('GITHUB_TOKEN');
  });
});
