/**
 * Unit tests for MOB-1000 — src/config/loader.ts
 *
 * Tests:
 *  - loadConfig priority chain: env var > project file > user file > default
 *  - setConfigValue writes correctly to the user config file
 *  - Unknown key throws an error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Mock 'node:fs/promises' before importing any modules that use it
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises');

import fs from 'node:fs/promises';
import { loadConfig, setConfigValue, clearConfigCache } from '../../src/config/loader.js';

const mockedFs = vi.mocked(fs);

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  delete process.env.FORJA_STORE_URL;
  clearConfigCache();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadConfig — env var takes priority (source: 'env')
// ---------------------------------------------------------------------------

describe('loadConfig() — env var priority', () => {
  it('returns env var URL with source "env" when FORJA_STORE_URL is set', async () => {
    process.env.FORJA_STORE_URL = 'postgresql://user:pass@env-host:5432/db';

    const result = await loadConfig();

    expect(result.storeUrl).toBe('postgresql://user:pass@env-host:5432/db');
    expect(result.source).toBe('env');
  });

  it('uses env var for storeUrl and reads config files for retentionDays', async () => {
    process.env.FORJA_STORE_URL = 'postgresql://user:pass@env-host:5432/db';

    const result = await loadConfig();

    expect(result.storeUrl).toBe('postgresql://user:pass@env-host:5432/db');
    expect(result.source).toBe('env');
    expect(result.retentionDays).toBe(90);
  });

  it('supports Neon/Supabase-style SSL connection strings', async () => {
    const sslUrl = 'postgresql://user:pass@db.neon.tech:5432/db?sslmode=require';
    process.env.FORJA_STORE_URL = sslUrl;

    const result = await loadConfig();

    expect(result.storeUrl).toBe(sslUrl);
    expect(result.source).toBe('env');
  });
});

// ---------------------------------------------------------------------------
// loadConfig — project file (source: 'project-file')
// ---------------------------------------------------------------------------

describe('loadConfig() — project file priority', () => {
  beforeEach(() => {
    delete process.env.FORJA_STORE_URL;
  });

  it('returns project file URL with source "project-file" when env var is absent', async () => {
    // First readFile call (project config) returns a valid config
    mockedFs.readFile
      .mockResolvedValueOnce(JSON.stringify({ storeUrl: 'postgresql://project-host/db' }) as unknown as Buffer);

    const result = await loadConfig();

    expect(result.storeUrl).toBe('postgresql://project-host/db');
    expect(result.source).toBe('project-file');
  });

  it('skips project file when it has no storeUrl property, falls through to user file', async () => {
    // Project config has no storeUrl
    mockedFs.readFile
      .mockResolvedValueOnce(JSON.stringify({}) as unknown as Buffer)
      // User config has a storeUrl
      .mockResolvedValueOnce(JSON.stringify({ storeUrl: 'postgresql://user-host/db' }) as unknown as Buffer);

    const result = await loadConfig();

    expect(result.storeUrl).toBe('postgresql://user-host/db');
    expect(result.source).toBe('user-file');
  });
});

// ---------------------------------------------------------------------------
// loadConfig — user file (source: 'user-file')
// ---------------------------------------------------------------------------

describe('loadConfig() — user file priority', () => {
  beforeEach(() => {
    delete process.env.FORJA_STORE_URL;
  });

  it('returns user file URL with source "user-file" when env and project file are absent', async () => {
    // Project config fails (file not found)
    mockedFs.readFile
      .mockRejectedValueOnce(new Error('ENOENT'))
      // User config returns valid config
      .mockResolvedValueOnce(JSON.stringify({ storeUrl: 'postgresql://user-host/db' }) as unknown as Buffer);

    const result = await loadConfig();

    expect(result.storeUrl).toBe('postgresql://user-host/db');
    expect(result.source).toBe('user-file');
  });
});

// ---------------------------------------------------------------------------
// loadConfig — default (source: 'default')
// ---------------------------------------------------------------------------

describe('loadConfig() — default fallback', () => {
  beforeEach(() => {
    delete process.env.FORJA_STORE_URL;
  });

  it('returns default URL with source "default" when all sources are absent', async () => {
    // Both config files fail
    mockedFs.readFile
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockRejectedValueOnce(new Error('ENOENT'));

    const result = await loadConfig();

    expect(result.storeUrl).toBe('postgresql://forja:forja@localhost:5432/forja');
    expect(result.source).toBe('default');
  });

  it('returns default URL when project and user config files have no storeUrl', async () => {
    mockedFs.readFile
      .mockResolvedValueOnce(JSON.stringify({}) as unknown as Buffer)
      .mockResolvedValueOnce(JSON.stringify({}) as unknown as Buffer);

    const result = await loadConfig();

    expect(result.storeUrl).toBe('postgresql://forja:forja@localhost:5432/forja');
    expect(result.source).toBe('default');
  });
});

// ---------------------------------------------------------------------------
// setConfigValue — writes to user config file
// ---------------------------------------------------------------------------

describe('setConfigValue()', () => {
  beforeEach(() => {
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
  });

  it('creates ~/.forja/ directory if it does not exist', async () => {
    mockedFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

    await setConfigValue('store_url', 'postgresql://new-host/db');

    expect(mockedFs.mkdir).toHaveBeenCalledWith(
      path.join(os.homedir(), '.forja'),
      { recursive: true, mode: 0o700 },
    );
  });

  it('writes storeUrl to ~/.forja/config.json when key is store_url', async () => {
    mockedFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

    await setConfigValue('store_url', 'postgresql://new-host/db');

    expect(mockedFs.writeFile).toHaveBeenCalledWith(
      path.join(os.homedir(), '.forja', 'config.json'),
      expect.stringContaining('"storeUrl": "postgresql://new-host/db"'),
      { mode: 0o600 },
    );
  });

  it('merges with existing config file content', async () => {
    const existingConfig = { storeUrl: 'postgresql://old-host/db' };
    mockedFs.readFile.mockResolvedValueOnce(JSON.stringify(existingConfig) as unknown as Buffer);

    await setConfigValue('store_url', 'postgresql://new-host/db');

    const writtenContent = (mockedFs.writeFile.mock.calls[0] as unknown[])[1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.storeUrl).toBe('postgresql://new-host/db');
  });

  it('writes a newline-terminated JSON file', async () => {
    mockedFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

    await setConfigValue('store_url', 'postgresql://new-host/db');

    const writtenContent = (mockedFs.writeFile.mock.calls[0] as unknown[])[1] as string;
    expect(writtenContent.endsWith('\n')).toBe(true);
  });

  it('throws an error for unknown config keys', async () => {
    await expect(setConfigValue('unknown_key', 'some-value')).rejects.toThrow(
      'Unknown config key: unknown_key',
    );
  });

  it('supports SSL connection strings with ?sslmode=require', async () => {
    mockedFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

    const sslUrl = 'postgresql://user:pass@db.supabase.co:5432/postgres?sslmode=require';
    await setConfigValue('store_url', sslUrl);

    const writtenContent = (mockedFs.writeFile.mock.calls[0] as unknown[])[1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.storeUrl).toBe(sslUrl);
  });
});
