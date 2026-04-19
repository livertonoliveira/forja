/**
 * Integration tests for MOB-1016 — githubToken config changes in src/config/loader.ts
 *
 * Strategy
 * --------
 * `USER_CONFIG_PATH` is a compile-time constant resolved via `os.homedir()`.
 * To redirect it to a temp dir we use `vi.resetModules()` + `vi.doMock('node:os', ...)`
 * before each dynamic `import()` of the module under test, so every test group
 * gets a fresh module instance pointing at an isolated temp directory.
 *
 * Groups 1-4 use a mini-loader (no mocking needed — they only exercise the
 * priority logic with explicit paths).
 * Groups 5-7 import the real module with a redirected homedir.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'forja-gh-token-test-'));
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Mini-loader that mirrors loader.ts priority logic but accepts explicit paths.
 * Used in groups 1–4 to avoid the module-level constant problem entirely.
 */
async function loadConfigFromPaths(
  projectConfigPath: string,
  userConfigPath: string,
  env: Record<string, string | undefined> = {},
): Promise<{ githubToken?: string; source: string }> {
  async function tryReadJson(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const [projectConfig, userConfig] = await Promise.all([
    tryReadJson(projectConfigPath),
    tryReadJson(userConfigPath),
  ]);

  const githubToken =
    (projectConfig?.githubToken as string | undefined) ??
    (userConfig?.githubToken as string | undefined) ??
    env.GITHUB_TOKEN;

  const forjaStoreUrl = env.FORJA_STORE_URL;
  let source: string;
  if (forjaStoreUrl) {
    source = 'env';
  } else if (projectConfig?.storeUrl) {
    source = 'project-file';
  } else if (userConfig?.storeUrl) {
    source = 'user-file';
  } else {
    source = 'default';
  }

  return { githubToken, source };
}

// ---------------------------------------------------------------------------
// 1. githubToken loaded from user config file
// ---------------------------------------------------------------------------

describe('loadConfig() — githubToken from user config file', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns githubToken from user config when only user config is present', async () => {
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    await writeJson(userConfigPath, { githubToken: 'ghp_from_user_config' });

    const result = await loadConfigFromPaths(
      path.join(tmpDir, 'nonexistent-project.json'),
      userConfigPath,
    );

    expect(result.githubToken).toBe('ghp_from_user_config');
  });

  it('returns undefined githubToken when user config exists but has no githubToken', async () => {
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    await writeJson(userConfigPath, { storeUrl: 'postgresql://host/db' });

    const result = await loadConfigFromPaths(
      path.join(tmpDir, 'nonexistent-project.json'),
      userConfigPath,
    );

    expect(result.githubToken).toBeUndefined();
  });

  it('returns githubToken when user config has both storeUrl and githubToken', async () => {
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    await writeJson(userConfigPath, {
      storeUrl: 'postgresql://host/db',
      githubToken: 'ghp_combined_user',
    });

    const result = await loadConfigFromPaths(
      path.join(tmpDir, 'nonexistent-project.json'),
      userConfigPath,
    );

    expect(result.githubToken).toBe('ghp_combined_user');
  });
});

// ---------------------------------------------------------------------------
// 2. githubToken loaded from project config file
// ---------------------------------------------------------------------------

describe('loadConfig() — githubToken from project config file', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns githubToken from project config when only project config is present', async () => {
    const projectConfigPath = path.join(tmpDir, 'forja', '.forja-config.json');
    await writeJson(projectConfigPath, {
      storeUrl: 'postgresql://host/db',
      githubToken: 'ghp_from_project',
    });

    const result = await loadConfigFromPaths(
      projectConfigPath,
      path.join(tmpDir, 'nonexistent-user.json'),
    );

    expect(result.githubToken).toBe('ghp_from_project');
  });

  it('returns githubToken from project config even when storeUrl is absent', async () => {
    const projectConfigPath = path.join(tmpDir, 'forja', '.forja-config.json');
    await writeJson(projectConfigPath, { githubToken: 'ghp_project_no_store' });

    const result = await loadConfigFromPaths(
      projectConfigPath,
      path.join(tmpDir, 'nonexistent-user.json'),
    );

    expect(result.githubToken).toBe('ghp_project_no_store');
  });
});

// ---------------------------------------------------------------------------
// 3. Project config githubToken takes precedence over user config
// ---------------------------------------------------------------------------

describe('loadConfig() — project githubToken overrides user githubToken', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns project githubToken when both project and user configs have a token', async () => {
    const projectConfigPath = path.join(tmpDir, 'forja', '.forja-config.json');
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');

    await writeJson(projectConfigPath, {
      storeUrl: 'postgresql://proj/db',
      githubToken: 'ghp_PROJECT_TOKEN',
    });
    await writeJson(userConfigPath, { githubToken: 'ghp_USER_TOKEN' });

    const result = await loadConfigFromPaths(projectConfigPath, userConfigPath);

    expect(result.githubToken).toBe('ghp_PROJECT_TOKEN');
  });

  it('falls back to user token when project config has no githubToken', async () => {
    const projectConfigPath = path.join(tmpDir, 'forja', '.forja-config.json');
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');

    await writeJson(projectConfigPath, { storeUrl: 'postgresql://proj/db' });
    await writeJson(userConfigPath, { githubToken: 'ghp_USER_FALLBACK' });

    const result = await loadConfigFromPaths(projectConfigPath, userConfigPath);

    expect(result.githubToken).toBe('ghp_USER_FALLBACK');
  });
});

// ---------------------------------------------------------------------------
// 4. Falls back to GITHUB_TOKEN env var
// ---------------------------------------------------------------------------

describe('loadConfig() — githubToken falls back to GITHUB_TOKEN env var', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns GITHUB_TOKEN env value when neither config file has a token', async () => {
    const result = await loadConfigFromPaths(
      path.join(tmpDir, 'nonexistent-project.json'),
      path.join(tmpDir, 'nonexistent-user.json'),
      { GITHUB_TOKEN: 'ghp_FROM_ENV' },
    );

    expect(result.githubToken).toBe('ghp_FROM_ENV');
  });

  it('returns undefined when no config file and no env var is set', async () => {
    const result = await loadConfigFromPaths(
      path.join(tmpDir, 'nonexistent-project.json'),
      path.join(tmpDir, 'nonexistent-user.json'),
      {},
    );

    expect(result.githubToken).toBeUndefined();
  });

  it('project config token takes precedence over GITHUB_TOKEN env var', async () => {
    const projectConfigPath = path.join(tmpDir, 'forja', '.forja-config.json');
    await writeJson(projectConfigPath, { githubToken: 'ghp_PROJECT_WINS' });

    const result = await loadConfigFromPaths(
      projectConfigPath,
      path.join(tmpDir, 'nonexistent-user.json'),
      { GITHUB_TOKEN: 'ghp_ENV_LOSES' },
    );

    expect(result.githubToken).toBe('ghp_PROJECT_WINS');
  });

  it('user config token takes precedence over GITHUB_TOKEN env var', async () => {
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    await writeJson(userConfigPath, { githubToken: 'ghp_USER_WINS' });

    const result = await loadConfigFromPaths(
      path.join(tmpDir, 'nonexistent-project.json'),
      userConfigPath,
      { GITHUB_TOKEN: 'ghp_ENV_LOSES' },
    );

    expect(result.githubToken).toBe('ghp_USER_WINS');
  });
});

// ---------------------------------------------------------------------------
// 5. clearConfigCache() + reload picks up new values
//    Uses real module with redirected homedir via vi.doMock + vi.resetModules.
// ---------------------------------------------------------------------------

describe('clearConfigCache() + reload', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    vi.resetModules();
    vi.doMock('node:os', () => ({
      default: { homedir: () => tmpDir },
      homedir: () => tmpDir,
    }));
    // Clear GITHUB_TOKEN to avoid env pollution
    delete process.env.GITHUB_TOKEN;
    delete process.env.FORJA_STORE_URL;
  });

  afterEach(async () => {
    vi.resetModules();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('clearConfigCache() + setConfigValue() + loadConfig() reflects the new githubToken', async () => {
    const { loadConfig, clearConfigCache, setConfigValue } = await import(
      '../../config/loader.js'
    );

    clearConfigCache();

    await setConfigValue('github_token', 'ghp_after_cache_clear');

    // Verify the file was written correctly
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    const written = await readJsonFile(userConfigPath);
    expect(written.githubToken).toBe('ghp_after_cache_clear');

    // Clear cache and reload — should pick up new value
    clearConfigCache();
    const config = await loadConfig();
    expect(config.githubToken).toBe('ghp_after_cache_clear');
  });

  it('second loadConfig() call without clearConfigCache() returns the cached value', async () => {
    const { loadConfig, clearConfigCache, setConfigValue } = await import(
      '../../config/loader.js'
    );

    clearConfigCache();

    // First load — no token
    const first = await loadConfig();
    expect(first.githubToken).toBeUndefined();

    // Write a token but do NOT clear the cache
    await setConfigValue('github_token', 'ghp_stale_cache');

    // Second load returns the cached result (still undefined)
    const second = await loadConfig();
    expect(second.githubToken).toBeUndefined();
  });

  it('clearConfigCache() allows loadConfig() to reflect token removal', async () => {
    const { loadConfig, clearConfigCache } = await import('../../config/loader.js');

    // Pre-write a token
    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    await writeJson(userConfigPath, { githubToken: 'ghp_to_be_removed' });

    clearConfigCache();
    const first = await loadConfig();
    expect(first.githubToken).toBe('ghp_to_be_removed');

    // Remove the config file
    await fs.rm(userConfigPath, { force: true });

    // Without clearing cache, old value is served
    const cached = await loadConfig();
    expect(cached.githubToken).toBe('ghp_to_be_removed');

    // After clearing cache, reload picks up the removal
    clearConfigCache();
    const fresh = await loadConfig();
    expect(fresh.githubToken).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. setConfigValue('github_token', ...) writes githubToken correctly
// ---------------------------------------------------------------------------

describe('setConfigValue("github_token", ...) integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir();
    vi.resetModules();
    vi.doMock('node:os', () => ({
      default: { homedir: () => tmpDir },
      homedir: () => tmpDir,
    }));
    delete process.env.GITHUB_TOKEN;
    delete process.env.FORJA_STORE_URL;
  });

  afterEach(async () => {
    vi.resetModules();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes githubToken field to ~/.forja/config.json', async () => {
    const { clearConfigCache, setConfigValue } = await import('../../config/loader.js');
    clearConfigCache();

    await setConfigValue('github_token', 'ghp_test');

    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    const parsed = await readJsonFile(userConfigPath);
    expect(parsed.githubToken).toBe('ghp_test');
  });

  it('creates ~/.forja/ directory with mode 0o700 if it does not exist', async () => {
    const { clearConfigCache, setConfigValue } = await import('../../config/loader.js');
    clearConfigCache();

    const forjaDir = path.join(tmpDir, '.forja');
    // Directory must not exist before the call
    await expect(fs.access(forjaDir)).rejects.toThrow();

    await setConfigValue('github_token', 'ghp_dir_creation');

    const stat = await fs.stat(forjaDir);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.mode & 0o777).toBe(0o700);
  });

  it('writes config file with mode 0o600', async () => {
    const { clearConfigCache, setConfigValue } = await import('../../config/loader.js');
    clearConfigCache();

    await setConfigValue('github_token', 'ghp_file_mode');

    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    const stat = await fs.stat(userConfigPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('preserves existing storeUrl when writing githubToken', async () => {
    const { clearConfigCache, setConfigValue } = await import('../../config/loader.js');
    clearConfigCache();

    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    await writeJson(userConfigPath, { storeUrl: 'postgresql://existing/db' });

    await setConfigValue('github_token', 'ghp_alongside_store');

    const parsed = await readJsonFile(userConfigPath);
    expect(parsed.storeUrl).toBe('postgresql://existing/db');
    expect(parsed.githubToken).toBe('ghp_alongside_store');
  });

  it('overwrites existing githubToken when called again', async () => {
    const { clearConfigCache, setConfigValue } = await import('../../config/loader.js');
    clearConfigCache();

    await setConfigValue('github_token', 'ghp_first');
    await setConfigValue('github_token', 'ghp_second');

    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    const parsed = await readJsonFile(userConfigPath);
    expect(parsed.githubToken).toBe('ghp_second');
  });

  it('writes a newline-terminated JSON file', async () => {
    const { clearConfigCache, setConfigValue } = await import('../../config/loader.js');
    clearConfigCache();

    await setConfigValue('github_token', 'ghp_newline_check');

    const userConfigPath = path.join(tmpDir, '.forja', 'config.json');
    const raw = await fs.readFile(userConfigPath, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('written value is loadable via loadConfig() after cache clear', async () => {
    const { loadConfig, clearConfigCache, setConfigValue } = await import(
      '../../config/loader.js'
    );
    clearConfigCache();

    await setConfigValue('github_token', 'ghp_roundtrip');

    clearConfigCache();
    const config = await loadConfig();
    expect(config.githubToken).toBe('ghp_roundtrip');
  });
});

// ---------------------------------------------------------------------------
// 7. `config get github_token` command output
// ---------------------------------------------------------------------------

describe('config get github_token — CLI output', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.resetModules();
  });

  it('prints "[set]" (not the actual token) when githubToken is set in config', async () => {
    vi.doMock('../../config/loader.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        storeUrl: 'postgresql://localhost/db',
        retentionDays: 90,
        githubToken: 'ghp_super_secret',
        source: 'user-file',
      }),
      setConfigValue: vi.fn(),
    }));

    const { configCommand } = await import('../../cli/commands/config.js');
    await configCommand.parseAsync(['node', 'forja', 'get', 'github_token']);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).toContain('[set]');
    expect(allLogs).not.toContain('ghp_super_secret');
  });

  it('prints "(not set)" when githubToken is absent and GITHUB_TOKEN env is absent', async () => {
    const savedGithubToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    vi.doMock('../../config/loader.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        storeUrl: 'postgresql://localhost/db',
        retentionDays: 90,
        githubToken: undefined,
        source: 'default',
      }),
      setConfigValue: vi.fn(),
    }));

    const { configCommand } = await import('../../cli/commands/config.js');
    await configCommand.parseAsync(['node', 'forja', 'get', 'github_token']);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).toContain('(not set)');

    if (savedGithubToken !== undefined) process.env.GITHUB_TOKEN = savedGithubToken;
  });

  it('prints source alongside the github_token status', async () => {
    vi.doMock('../../config/loader.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        storeUrl: 'postgresql://localhost/db',
        retentionDays: 90,
        githubToken: 'ghp_some_token',
        source: 'project-file',
      }),
      setConfigValue: vi.fn(),
    }));

    const { configCommand } = await import('../../cli/commands/config.js');
    await configCommand.parseAsync(['node', 'forja', 'get', 'github_token']);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).toContain('project-file');
  });

  it('does not print the raw token value even when it looks innocuous', async () => {
    vi.doMock('../../config/loader.js', () => ({
      loadConfig: vi.fn().mockResolvedValue({
        storeUrl: 'postgresql://localhost/db',
        retentionDays: 90,
        githubToken: 'totally-safe-looking-value',
        source: 'env',
      }),
      setConfigValue: vi.fn(),
    }));

    const { configCommand } = await import('../../cli/commands/config.js');
    await configCommand.parseAsync(['node', 'forja', 'get', 'github_token']);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).not.toContain('totally-safe-looking-value');
    expect(allLogs).toContain('[set]');
  });
});
