/**
 * Unit tests for MOB-1000 — src/cli/commands/config.ts
 *
 * Tests:
 *  - `forja config get store_url` prints value and source
 *  - `forja config set store_url <dsn>` calls setConfigValue and prints confirmation
 *  - Error cases: missing key, missing value, unknown key, unknown action
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — set up before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn(),
  setConfigValue: vi.fn(),
}));

import { loadConfig, setConfigValue } from '../../src/config/loader.js';
import { configCommand } from '../../src/cli/commands/config.js';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedSetConfigValue = vi.mocked(setConfigValue);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let processExitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
    throw new Error(`process.exit(${_code})`);
  });
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  processExitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// config get — happy path
// ---------------------------------------------------------------------------

describe('config get store_url', () => {
  it('prints the store_url value from loadConfig()', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://localhost:5432/forja',
      source: 'default',
    });

    await configCommand.parseAsync(['node', 'forja', 'get', 'store_url']);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).toContain('store_url');
    expect(allLogs).toContain('postgresql://localhost:5432/forja');
  });

  it('prints the source alongside the value', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://localhost:5432/forja',
      source: 'user-file',
    });

    await configCommand.parseAsync(['node', 'forja', 'get', 'store_url']);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).toContain('user-file');
  });

  it('prints "env" as source when loaded from environment variable', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://env-host/db',
      source: 'env',
    });

    await configCommand.parseAsync(['node', 'forja', 'get', 'store_url']);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).toContain('env');
  });

  it('exits with error for unknown key in get', async () => {
    await expect(
      configCommand.parseAsync(['node', 'forja', 'get', 'unknown_key']),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain('Unknown config key');
  });

  it('exits with error when key is missing in get', async () => {
    await expect(
      configCommand.parseAsync(['node', 'forja', 'get']),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain('requires a key');
  });
});

// ---------------------------------------------------------------------------
// config set — happy path
// ---------------------------------------------------------------------------

describe('config set store_url', () => {
  it('calls setConfigValue with correct key and value', async () => {
    mockedSetConfigValue.mockResolvedValue(undefined);

    await configCommand.parseAsync([
      'node', 'forja', 'set', 'store_url', 'postgresql://new-host/db',
    ]);

    expect(mockedSetConfigValue).toHaveBeenCalledOnce();
    expect(mockedSetConfigValue).toHaveBeenCalledWith('store_url', 'postgresql://new-host/db');
  });

  it('prints a confirmation message after saving', async () => {
    mockedSetConfigValue.mockResolvedValue(undefined);

    await configCommand.parseAsync([
      'node', 'forja', 'set', 'store_url', 'postgresql://new-host/db',
    ]);

    const allLogs = consoleLogSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allLogs).toContain('store_url');
    expect(allLogs).toContain('~/.forja/config.json');
  });

  it('works with Neon/Supabase SSL connection strings', async () => {
    mockedSetConfigValue.mockResolvedValue(undefined);

    const sslUrl = 'postgresql://user:pass@db.neon.tech:5432/db?sslmode=require';
    await configCommand.parseAsync(['node', 'forja', 'set', 'store_url', sslUrl]);

    expect(mockedSetConfigValue).toHaveBeenCalledWith('store_url', sslUrl);
  });

  it('exits with error when key is missing in set', async () => {
    await expect(
      configCommand.parseAsync(['node', 'forja', 'set']),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain('requires a key and value');
  });

  it('exits with error when value is missing in set', async () => {
    await expect(
      configCommand.parseAsync(['node', 'forja', 'set', 'store_url']),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain('requires a key and value');
  });
});

// ---------------------------------------------------------------------------
// config — unknown action
// ---------------------------------------------------------------------------

describe('config — unknown action', () => {
  it('exits with error for unknown action', async () => {
    await expect(
      configCommand.parseAsync(['node', 'forja', 'delete', 'store_url']),
    ).rejects.toThrow('process.exit(1)');

    expect(processExitSpy).toHaveBeenCalledWith(1);
    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain('Unknown action');
  });
});
