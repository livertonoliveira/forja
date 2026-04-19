/**
 * E2E / acceptance tests for MOB-1016 — GitHub Checks integration and `forja config` CLI.
 *
 * Acceptance criteria covered:
 *   1. `createCheck` is safe when no GITHUB_TOKEN is present (logs warning, does not throw)
 *   2. `forja config set github_token <value>` persists the token to ~/.forja/config.json
 *   3. `forja config get github_token` prints `[set]` (not the actual token value)
 *   4. `getGitRemoteInfo()` returns a non-null result with correct owner/repo on a real repo
 *   5. `parseGitRemote` correctly parses SSH and HTTPS remote URLs
 *
 * NOTE: Tests that would hit the live GitHub API (POST /check-runs) are intentionally skipped
 * because they require network access and a valid GitHub App token with `checks:write` scope.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'node:fs';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
const TSX = path.resolve(PROJECT_ROOT, 'node_modules/.bin/tsx');
// Dedicated runners avoid depending on the esbuild binary (bin/forja) and the
// __FORJA_VERSION__ define that esbuild injects at build time.
const CONFIG_RUNNER = path.resolve(PROJECT_ROOT, 'tests/e2e/_config-runner.ts');
const NO_TOKEN_RUNNER = path.resolve(PROJECT_ROOT, 'tests/e2e/_no-token-runner.ts');
const TIMEOUT = 15_000;

// ---------------------------------------------------------------------------
// 1. createCheck — no token behavior
// ---------------------------------------------------------------------------

describe('createCheck — GITHUB_TOKEN absent', () => {
  it('does not throw and logs a warning when no token is available', () => {
    // Run in a subprocess with a temp HOME (no ~/.forja/config.json) and no
    // GITHUB_TOKEN env var, giving full process isolation from the test env.
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-e2e-notoken-'));

    try {
      const result = spawnSync(TSX, [NO_TOKEN_RUNNER], {
        timeout: TIMEOUT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          HOME: tempHome,
          GITHUB_TOKEN: undefined as unknown as string,
        },
      });

      expect(result.status, `stderr: ${result.stderr}`).toBe(0);
      // Runner prints NO_THROW on success
      expect(result.stdout).toContain('NO_THROW');
      // Runner prints the captured warnings as JSON
      const warningsLine = result.stdout
        .split('\n')
        .find((l) => l.startsWith('WARNINGS:'));
      expect(warningsLine).toBeDefined();
      const warnings: string[] = JSON.parse(warningsLine!.replace('WARNINGS:', ''));
      const hasTokenWarning = warnings.some((w) => w.includes('GITHUB_TOKEN not set'));
      expect(hasTokenWarning, `warnings: ${JSON.stringify(warnings)}`).toBe(true);
    } finally {
      try {
        fs.rmSync(tempHome, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2 & 3. `forja config set/get github_token` CLI acceptance tests
// ---------------------------------------------------------------------------

describe('forja config — github_token CLI', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  // Use an isolated temp directory as HOME so we never touch the real ~/.forja
  function setupTempHome() {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-e2e-config-'));
    originalHome = process.env.HOME;
    // spawnSync does not inherit process.env by default; we pass env explicitly
  }

  afterEach(() => {
    if (tempHome) {
      try {
        fs.rmSync(tempHome, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it('`forja config set github_token <value>` saves the token to ~/.forja/config.json', () => {
    setupTempHome();

    const result = spawnSync(TSX, [CONFIG_RUNNER, 'set', 'github_token', 'ghp_test123'], {
      timeout: TIMEOUT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: tempHome,
        // Remove any existing token so the config loader starts clean
        GITHUB_TOKEN: undefined as unknown as string,
      },
    });

    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('github_token saved to ~/.forja/config.json');

    // Verify the file was created with the correct value
    const configPath = path.join(tempHome, '.forja', 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(saved.githubToken).toBe('ghp_test123');
  });

  it('`forja config get github_token` prints `[set]` after token was saved', () => {
    setupTempHome();

    // First, set the token
    const setResult = spawnSync(TSX, [CONFIG_RUNNER, 'set', 'github_token', 'ghp_test456'], {
      timeout: TIMEOUT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: tempHome,
        GITHUB_TOKEN: undefined as unknown as string,
      },
    });
    expect(setResult.status, `set stderr: ${setResult.stderr}`).toBe(0);

    // Then get it — should print [set], not the actual value
    const getResult = spawnSync(TSX, [CONFIG_RUNNER, 'get', 'github_token'], {
      timeout: TIMEOUT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: tempHome,
        GITHUB_TOKEN: undefined as unknown as string,
      },
    });

    expect(getResult.status, `get stderr: ${getResult.stderr}`).toBe(0);
    expect(getResult.stdout).toContain('[set]');
    // Must NOT expose the actual token value
    expect(getResult.stdout).not.toContain('ghp_test456');
  });

  it('`forja config get github_token` prints `(not set)` when no token exists', () => {
    setupTempHome();

    const result = spawnSync(TSX, [CONFIG_RUNNER, 'get', 'github_token'], {
      timeout: TIMEOUT,
      encoding: 'utf-8',
      env: {
        ...process.env,
        HOME: tempHome,
        GITHUB_TOKEN: undefined as unknown as string,
      },
    });

    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('(not set)');
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. parseGitRemote + getGitRemoteInfo correctness
// ---------------------------------------------------------------------------

describe('parseGitRemote — URL parsing', () => {
  it('parses SSH remote URL correctly', async () => {
    const { parseGitRemote } = await import('../github-checks.js');

    const result = parseGitRemote('git@github.com:acme-org/my-repo.git');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('acme-org');
    expect(result!.repo).toBe('my-repo');
  });

  it('parses SSH remote URL without .git suffix', async () => {
    const { parseGitRemote } = await import('../github-checks.js');

    const result = parseGitRemote('git@github.com:acme-org/my-repo');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('acme-org');
    expect(result!.repo).toBe('my-repo');
  });

  it('parses HTTPS remote URL correctly', async () => {
    const { parseGitRemote } = await import('../github-checks.js');

    const result = parseGitRemote('https://github.com/acme-org/my-repo.git');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('acme-org');
    expect(result!.repo).toBe('my-repo');
  });

  it('parses HTTPS remote URL without .git suffix', async () => {
    const { parseGitRemote } = await import('../github-checks.js');

    const result = parseGitRemote('https://github.com/acme-org/my-repo');
    expect(result).not.toBeNull();
    expect(result!.owner).toBe('acme-org');
    expect(result!.repo).toBe('my-repo');
  });

  it('returns null for non-GitHub remote', async () => {
    const { parseGitRemote } = await import('../github-checks.js');

    expect(parseGitRemote('git@gitlab.com:acme/repo.git')).toBeNull();
    expect(parseGitRemote('https://bitbucket.org/acme/repo.git')).toBeNull();
    expect(parseGitRemote('')).toBeNull();
  });
});

describe('getGitRemoteInfo — real repo detection', () => {
  it('returns non-null owner/repo from the current repository origin', async () => {
    const { getGitRemoteInfo } = await import('../github-checks.js');

    const info = await getGitRemoteInfo();

    // The working directory is the forja repo itself (git@github.com:livertonoliveira/forja.git)
    // We only assert structural correctness, not exact values, so this test remains
    // valid on any fork or rename.
    expect(info).not.toBeNull();
    expect(typeof info!.owner).toBe('string');
    expect(info!.owner.length).toBeGreaterThan(0);
    expect(typeof info!.repo).toBe('string');
    expect(info!.repo.length).toBeGreaterThan(0);
  });
});
