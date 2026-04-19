/**
 * E2E smoke tests for MOB-1001 — `forja prune` CLI command.
 *
 * These tests exercise the CLI binary surface via spawnSync (no real DB required).
 * They verify:
 *  - --help exits 0 and shows the command description
 *  - --before with an invalid date exits 1 and prints an error message
 *  - --dry-run either exits 0 (DB available) or exits non-zero with a meaningful
 *    error message (not an unhandled exception / stack trace)
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

const TSX = path.resolve('node_modules/.bin/tsx');
const CLI_ENTRY = path.resolve('tests/e2e/_prune-runner.ts');
const PROJECT_ROOT = path.resolve('.');

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runPrune(args: string[], env?: Record<string, string>): SpawnResult {
  const result = spawnSync(TSX, [CLI_ENTRY, ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: --help exits 0 and shows the command description
// ---------------------------------------------------------------------------

describe('forja prune --help', () => {
  it('exits 0 and prints the prune description', () => {
    const { exitCode, stdout } = runPrune(['--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('prune');
    expect(stdout).toContain('Remove old runs');
  });

  it('shows --before option in help output', () => {
    const { stdout } = runPrune(['--help']);
    expect(stdout).toContain('--before');
  });

  it('shows --dry-run option in help output', () => {
    const { stdout } = runPrune(['--help']);
    expect(stdout).toContain('--dry-run');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: --before with an invalid date exits 1 with an error message
// ---------------------------------------------------------------------------

describe('forja prune --before <invalid-date>', () => {
  it('exits 1 when the date argument is not a valid ISO date', () => {
    const { exitCode } = runPrune(['--before', 'not-a-date']);
    expect(exitCode).toBe(1);
  });

  it('prints an error message to stderr or stdout containing the invalid value', () => {
    const { stdout, stderr } = runPrune(['--before', 'not-a-date']);
    const combined = stdout + stderr;
    expect(combined).toContain('not-a-date');
  });

  it('exits 1 for a garbled date string like "2026-99-99"', () => {
    const { exitCode } = runPrune(['--before', '2026-99-99']);
    expect(exitCode).toBe(1);
  });

  it('exits 1 for a random word', () => {
    const { exitCode } = runPrune(['--before', 'yesterday']);
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: --dry-run with no DB — exits non-zero but no unhandled exception
// ---------------------------------------------------------------------------

describe('forja prune --dry-run (no DB)', () => {
  it('does not crash with an unhandled exception', () => {
    const { stdout, stderr } = runPrune(['--dry-run'], {
      FORJA_STORE_URL: 'postgresql://forja:forja@localhost:5432/forja_nonexistent',
    });
    const combined = stdout + stderr;
    expect(combined).not.toContain('UnhandledPromiseRejection');
    expect(combined).not.toContain('TypeError');
  });

  it('produces output even when DB is unavailable', () => {
    const { stdout, stderr } = runPrune(['--dry-run'], {
      FORJA_STORE_URL: 'postgresql://forja:forja@localhost:5432/forja_nonexistent',
    });
    const combined = stdout + stderr;
    expect(combined.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: --before with a valid ISO date + --dry-run — same resilience check
// ---------------------------------------------------------------------------

describe('forja prune --before <valid-date> --dry-run (no DB)', () => {
  it('does not throw an unhandled exception for a valid date', () => {
    const { stdout, stderr } = runPrune(['--before', '2025-01-01', '--dry-run'], {
      FORJA_STORE_URL: 'postgresql://forja:forja@localhost:5432/forja_nonexistent',
    });
    const combined = stdout + stderr;
    expect(combined).not.toContain('UnhandledPromiseRejection');
  });

  it('does not produce a Node.js stack trace on stderr', () => {
    const { stderr } = runPrune(['--before', '2025-01-01', '--dry-run'], {
      FORJA_STORE_URL: 'postgresql://forja:forja@localhost:5432/forja_nonexistent',
    });
    expect(stderr).not.toMatch(/at .+\(.+:\d+:\d+\)/);
  });
});
