/**
 * E2E smoke tests for MOB-1038 — `forja plugins list` CLI command.
 *
 * These tests exercise the CLI binary surface via spawnSync (no real plugins required).
 * They verify:
 *  - `plugins list` exits 0 with a friendly "no plugins" message when none are registered
 *  - `plugins list --json` exits 0 and outputs a valid empty JSON array
 *  - `plugins list --help` exits 0 and shows the command description
 *  - `plugins list --invalid` exits 0 and shows a fallback message
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';

const TSX = path.resolve('node_modules/.bin/tsx');
const CLI_ENTRY = path.resolve('tests/e2e/_plugins-runner.ts');
const PROJECT_ROOT = path.resolve('.');

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run `forja plugins <args>` in an isolated temp directory that has no
 * `forja/plugins/` folder, so no local plugins are discovered.
 */
function runPlugins(args: string[], cwd?: string): SpawnResult {
  const result = spawnSync(TSX, [CLI_ENTRY, ...args], {
    cwd: cwd ?? PROJECT_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      // Prevent accidental npm-global plugin discovery
      npm_config_prefix: '',
    },
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

describe('forja plugins list --help', () => {
  it('exits 0', () => {
    const { exitCode } = runPlugins(['list', '--help']);
    expect(exitCode).toBe(0);
  });

  it('prints the list description', () => {
    const { stdout } = runPlugins(['list', '--help']);
    expect(stdout).toContain('list');
    expect(stdout).toContain('plugin');
  });

  it('shows --json option in help output', () => {
    const { stdout } = runPlugins(['list', '--help']);
    expect(stdout).toContain('--json');
  });

  it('shows --invalid option in help output', () => {
    const { stdout } = runPlugins(['list', '--help']);
    expect(stdout).toContain('--invalid');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: no plugins registered — friendly message and exit 0
// ---------------------------------------------------------------------------

describe('forja plugins list (no plugins)', () => {
  let tmpDir: string;

  // Create a fresh temp directory with no forja/plugins/ folder
  function setup(): void {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-e2e-'));
  }

  function teardown(): void {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it('exits 0 when no plugins are found', () => {
    setup();
    try {
      const { exitCode } = runPlugins(['list'], tmpDir);
      expect(exitCode).toBe(0);
    } finally {
      teardown();
    }
  });

  it('prints a friendly "no plugins" message', () => {
    setup();
    try {
      const { stdout } = runPlugins(['list'], tmpDir);
      expect(stdout.toLowerCase()).toContain('no plugins');
    } finally {
      teardown();
    }
  });

  it('does not print a stack trace', () => {
    setup();
    try {
      const { stderr } = runPlugins(['list'], tmpDir);
      expect(stderr).not.toMatch(/at .+\(.+:\d+:\d+\)/);
    } finally {
      teardown();
    }
  });

  it('does not throw an unhandled exception', () => {
    setup();
    try {
      const { stdout, stderr } = runPlugins(['list'], tmpDir);
      const combined = stdout + stderr;
      expect(combined).not.toContain('UnhandledPromiseRejection');
      expect(combined).not.toContain('TypeError');
    } finally {
      teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: --json flag with no plugins — valid empty JSON array
// ---------------------------------------------------------------------------

describe('forja plugins list --json (no plugins)', () => {
  let tmpDir: string;

  function setup(): void {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-e2e-'));
  }

  function teardown(): void {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it('exits 0', () => {
    setup();
    try {
      const { exitCode } = runPlugins(['list', '--json'], tmpDir);
      expect(exitCode).toBe(0);
    } finally {
      teardown();
    }
  });

  it('outputs a valid JSON array', () => {
    setup();
    try {
      const { stdout } = runPlugins(['list', '--json'], tmpDir);
      expect(() => JSON.parse(stdout)).not.toThrow();
    } finally {
      teardown();
    }
  });

  it('outputs an empty array when no plugins are registered', () => {
    setup();
    try {
      const { stdout } = runPlugins(['list', '--json'], tmpDir);
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    } finally {
      teardown();
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: --invalid flag — fallback message, no crash
// ---------------------------------------------------------------------------

describe('forja plugins list --invalid', () => {
  it('exits 0', () => {
    const { exitCode } = runPlugins(['list', '--invalid']);
    expect(exitCode).toBe(0);
  });

  it('prints a message about invalid plugin tracking', () => {
    const { stdout } = runPlugins(['list', '--invalid']);
    expect(stdout.toLowerCase()).toMatch(/invalid|plugin/);
  });

  it('does not throw an unhandled exception', () => {
    const { stdout, stderr } = runPlugins(['list', '--invalid']);
    const combined = stdout + stderr;
    expect(combined).not.toContain('UnhandledPromiseRejection');
  });
});
