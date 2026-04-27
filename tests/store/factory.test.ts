/**
 * Unit tests for MOB-1000 — src/store/factory.ts
 *
 * Tests:
 *  - createStoreFromConfig() returns the store on connection success
 *  - createStoreFromConfig() prints a friendly error and exits on connection failure
 *  - Error messages include the connection URL and recovery suggestions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — set up before importing the module under test
// ---------------------------------------------------------------------------

const mockListRuns = vi.fn();
const mockPing = vi.fn();
const mockStore = {
  ping: mockPing,
  listRuns: mockListRuns,
  createRun: vi.fn(),
  updateRun: vi.fn(),
  getRun: vi.fn(),
  createPhase: vi.fn(),
  updatePhase: vi.fn(),
  getPhase: vi.fn(),
  listPhases: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  insertFinding: vi.fn(),
  insertFindings: vi.fn(),
  listFindings: vi.fn(),
  insertToolCall: vi.fn(),
  insertCostEvent: vi.fn(),
  costSummaryByPhase: vi.fn(),
  insertGateDecision: vi.fn(),
  getLatestGateDecision: vi.fn(),
  linkIssue: vi.fn(),
  listIssueLinks: vi.fn(),
  close: vi.fn(),
};

vi.mock('../../src/store/index.js', () => ({
  createStore: vi.fn(() => mockStore),
}));

vi.mock('../../src/config/loader.js', () => ({
  loadConfig: vi.fn(),
  setConfigValue: vi.fn(),
  redactDsn: vi.fn((url: string) => url),
}));

// ---------------------------------------------------------------------------
// Import mocked modules after vi.mock() declarations
// ---------------------------------------------------------------------------

import { createStore } from '../../src/store/index.js';
import { loadConfig } from '../../src/config/loader.js';
import { createStoreFromConfig } from '../../src/store/factory.js';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedCreateStore = vi.mocked(createStore);

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let processExitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  processExitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string) => {
    throw new Error(`process.exit(${_code})`);
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  processExitSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// createStoreFromConfig — happy path
// ---------------------------------------------------------------------------

describe('createStoreFromConfig() — connection success', () => {
  it('returns the store when ping() resolves successfully', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
      projectId: 'test-project',
      source: 'default',
    });
    mockPing.mockResolvedValue(undefined);

    const store = await createStoreFromConfig();

    expect(store).toBe(mockStore);
    expect(mockPing).toHaveBeenCalledOnce();
  });

  it('calls loadConfig() to get the connection string', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://user:pass@host:5432/db',
      projectId: 'test-project',
      source: 'user-file',
    });
    mockPing.mockResolvedValue(undefined);

    await createStoreFromConfig();

    expect(mockedLoadConfig).toHaveBeenCalledOnce();
    expect(mockedCreateStore).toHaveBeenCalledWith('postgresql://user:pass@host:5432/db');
  });

  it('does not print any error when connection succeeds', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
      projectId: 'test-project',
      source: 'default',
    });
    mockPing.mockResolvedValue(undefined);

    await createStoreFromConfig();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createStoreFromConfig — connection failure
// ---------------------------------------------------------------------------

describe('createStoreFromConfig() — connection failure', () => {
  it('calls process.exit(1) when ping() rejects', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
      projectId: 'test-project',
      source: 'default',
    });
    mockPing.mockRejectedValue(new Error('Connection refused'));

    await expect(createStoreFromConfig()).rejects.toThrow('process.exit(1)');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('prints an error message containing the connection URL', async () => {
    const storeUrl = 'postgresql://forja:forja@localhost:5432/forja';
    mockedLoadConfig.mockResolvedValue({ storeUrl, projectId: 'test-project', source: 'default' });
    mockPing.mockRejectedValue(new Error('Connection refused'));

    try {
      await createStoreFromConfig();
    } catch {
      // process.exit throws in our mock
    }

    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain(storeUrl);
  });

  it('prints recovery suggestion mentioning "forja infra up"', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
      projectId: 'test-project',
      source: 'default',
    });
    mockPing.mockRejectedValue(new Error('Connection refused'));

    try {
      await createStoreFromConfig();
    } catch {
      // process.exit throws in our mock
    }

    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain('forja infra up');
  });

  it('prints recovery suggestion mentioning FORJA_STORE_URL', async () => {
    mockedLoadConfig.mockResolvedValue({
      storeUrl: 'postgresql://forja:forja@localhost:5432/forja',
      projectId: 'test-project',
      source: 'default',
    });
    mockPing.mockRejectedValue(new Error('Connection refused'));

    try {
      await createStoreFromConfig();
    } catch {
      // process.exit throws in our mock
    }

    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain('FORJA_STORE_URL');
  });

  it('handles Neon/Supabase SSL URL in error message', async () => {
    const sslUrl = 'postgresql://user:pass@db.neon.tech:5432/db?sslmode=require';
    mockedLoadConfig.mockResolvedValue({ storeUrl: sslUrl, projectId: 'test-project', source: 'env' });
    mockPing.mockRejectedValue(new Error('SSL SYSCALL error'));

    try {
      await createStoreFromConfig();
    } catch {
      // process.exit throws in our mock
    }

    const allErrors = consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(allErrors).toContain(sslUrl);
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
