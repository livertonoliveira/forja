/**
 * Unit tests for MOB-998 — Docker Compose wrapper (src/infra/docker.ts)
 *
 * Covers:
 *  - checkDockerAvailable() — resolves when exec succeeds; throws friendly message on failure
 *  - composeUp()            — calls `docker compose up -d`
 *  - composeDown()          — calls `docker compose down`
 *  - composeStatus()        — returns stdout from `docker compose ps`
 *  - waitForHealthy()       — resolves when service shows healthy; throws on timeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock child_process before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

import { exec } from 'child_process';
import {
  checkDockerAvailable,
  composeUp,
  composeDown,
  composeStatus,
  waitForHealthy,
} from '../../src/infra/docker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExecCallback = (error: Error | null, result: { stdout: string; stderr: string }) => void;

/**
 * Configure the exec mock to call its callback with a success result.
 */
function mockExecSuccess(stdout = '', stderr = '') {
  vi.mocked(exec).mockImplementation((_cmd: unknown, _optsOrCb: unknown, maybeCb?: unknown) => {
    const cb = (typeof maybeCb === 'function' ? maybeCb : _optsOrCb) as ExecCallback;
    cb(null, { stdout, stderr });
    return {} as ReturnType<typeof exec>;
  });
}

/**
 * Configure the exec mock to call its callback with an error.
 */
function mockExecFailure(message = 'exec error') {
  vi.mocked(exec).mockImplementation((_cmd: unknown, _optsOrCb: unknown, maybeCb?: unknown) => {
    const cb = (typeof maybeCb === 'function' ? maybeCb : _optsOrCb) as ExecCallback;
    cb(new Error(message), { stdout: '', stderr: message });
    return {} as ReturnType<typeof exec>;
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// checkDockerAvailable
// ---------------------------------------------------------------------------

describe('checkDockerAvailable()', () => {
  it('resolves without error when exec succeeds', async () => {
    mockExecSuccess();
    await expect(checkDockerAvailable()).resolves.toBeUndefined();
  });

  it('throws a friendly message containing "Docker não encontrado" when exec fails', async () => {
    mockExecFailure('command not found: docker');
    await expect(checkDockerAvailable()).rejects.toThrow('Docker não encontrado');
  });

  it('calls `docker info`', async () => {
    mockExecSuccess();
    await checkDockerAvailable();
    expect(vi.mocked(exec)).toHaveBeenCalledWith(
      'docker version --format json',
      { maxBuffer: 10 * 1024 * 1024 },
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// composeUp
// ---------------------------------------------------------------------------

describe('composeUp()', () => {
  it('resolves without error on success', async () => {
    mockExecSuccess();
    await expect(composeUp()).resolves.toBeUndefined();
  });

  it('calls `docker compose up -d`', async () => {
    mockExecSuccess();
    await composeUp();
    const calls = vi.mocked(exec).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const cmd = calls[0][0] as string;
    expect(cmd).toBe('docker compose up -d');
  });

  it('rejects when exec fails', async () => {
    mockExecFailure('compose error');
    await expect(composeUp()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// composeDown
// ---------------------------------------------------------------------------

describe('composeDown()', () => {
  it('resolves without error on success', async () => {
    mockExecSuccess();
    await expect(composeDown()).resolves.toBeUndefined();
  });

  it('calls `docker compose down`', async () => {
    mockExecSuccess();
    await composeDown();
    const calls = vi.mocked(exec).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const cmd = calls[0][0] as string;
    expect(cmd).toBe('docker compose down');
  });

  it('rejects when exec fails', async () => {
    mockExecFailure('down error');
    await expect(composeDown()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// composeStatus
// ---------------------------------------------------------------------------

describe('composeStatus()', () => {
  it('returns the stdout from docker compose ps', async () => {
    const psOutput = 'NAME    IMAGE   STATUS\npostgres  postgres  Up';
    mockExecSuccess(psOutput);
    const result = await composeStatus();
    expect(result).toBe(psOutput);
  });

  it('calls `docker compose ps`', async () => {
    mockExecSuccess('');
    await composeStatus();
    const calls = vi.mocked(exec).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const cmd = calls[0][0] as string;
    expect(cmd).toBe('docker compose ps');
  });

  it('rejects when exec fails', async () => {
    mockExecFailure('ps error');
    await expect(composeStatus()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// waitForHealthy
// ---------------------------------------------------------------------------

describe('waitForHealthy()', () => {
  it('resolves immediately when the service is already healthy (Health field)', async () => {
    const psJson = JSON.stringify({ Service: 'postgres', Health: 'healthy', Status: 'Up' });
    mockExecSuccess(psJson + '\n');

    await expect(waitForHealthy('postgres', 5000)).resolves.toBeUndefined();
  });

  it('resolves immediately when the service is healthy via Status field containing "healthy"', async () => {
    const psJson = JSON.stringify({ Service: 'postgres', Health: '', Status: 'Up (healthy)' });
    mockExecSuccess(psJson + '\n');

    await expect(waitForHealthy('postgres', 5000)).resolves.toBeUndefined();
  });

  it('resolves when service name is a substring match (container name includes service name)', async () => {
    const psJson = JSON.stringify({ Name: 'myproject-postgres-1', Health: 'healthy', Status: 'Up' });
    mockExecSuccess(psJson + '\n');

    await expect(waitForHealthy('postgres', 5000)).resolves.toBeUndefined();
  });

  it('throws "Timeout" error when service never becomes healthy within timeoutMs', async () => {
    // Always return non-healthy output
    const psJson = JSON.stringify({ Service: 'postgres', Health: 'starting', Status: 'Up' });
    mockExecSuccess(psJson + '\n');

    // Use a very short timeout so the test doesn't hang
    await expect(waitForHealthy('postgres', 1)).rejects.toThrow('Timeout');
  });

  it('throws when exec itself fails', async () => {
    mockExecFailure('ps --format error');
    await expect(waitForHealthy('postgres', 5000)).rejects.toThrow();
  });
});
