/**
 * E2E tests for `forja hook pre-tool-use` — MOB-1005.
 *
 * Tests the pre-tool-use hook end-to-end:
 *   - Spawns the hook CLI as a subprocess (via tsx + _hook-runner.ts)
 *   - Passes a JSON payload via stdin with a tool_name
 *   - Sets FORJA_PHASE env var to control which phase is active
 *   - Asserts exit code and stdout JSON based on policy in policies/tools.yaml
 *
 * Policy summary (from policies/tools.yaml):
 *   security phase: deny [Write, Edit, Bash, MultiEdit]
 *   develop phase:  allow "*"
 *   unknown phase:  no policy → fail-open (exit 0)
 */

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import path from 'path';
import { spawnSync } from 'child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute project root — cwd for subprocess */
const PROJECT_ROOT = path.resolve('.');

/** Path to the tsx binary */
const TSX = path.resolve('node_modules/.bin/tsx');

/** Minimal hook runner that avoids importing src/cli/index.ts */
const HOOK_RUNNER = path.resolve('tests/e2e/_hook-runner.ts');

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn `forja hook pre-tool-use` via tsx, passing the given payload as stdin.
 * FORJA_RUN_ID is always set to a valid UUID so the hook does not skip early.
 */
function runPreToolUse(
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): HookResult {
  const result = spawnSync(TSX, [HOOK_RUNNER, 'pre-tool-use'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    input: JSON.stringify(payload),
    env: {
      ...process.env,
      // Always provide a valid UUID so the early-exit guard passes
      FORJA_RUN_ID: randomUUID(),
      ...env,
    },
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Edit in security phase → blocked (exit 2, decision: block)
// ---------------------------------------------------------------------------

describe('pre-tool-use hook — Edit blocked in security phase', () => {
  it('exits with code 2 and returns decision:block when tool is Edit in security phase', () => {
    const { exitCode, stdout } = runPreToolUse(
      { tool_name: 'Edit' },
      { FORJA_PHASE: 'security' },
    );

    expect(exitCode).toBe(2);

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe('block');
    expect(typeof parsed.reason).toBe('string');
    expect(parsed.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Read in security phase → allowed (exit 0)
// ---------------------------------------------------------------------------

describe('pre-tool-use hook — Read allowed in security phase', () => {
  it('exits with code 0 when tool is Read in security phase', () => {
    const { exitCode } = runPreToolUse(
      { tool_name: 'Read' },
      { FORJA_PHASE: 'security' },
    );

    expect(exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Edit in develop phase → allowed (exit 0)
// ---------------------------------------------------------------------------

describe('pre-tool-use hook — Edit allowed in develop phase', () => {
  it('exits with code 0 when tool is Edit in develop phase (allow: "*")', () => {
    const { exitCode } = runPreToolUse(
      { tool_name: 'Edit' },
      { FORJA_PHASE: 'develop' },
    );

    expect(exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Edit with unknown phase → fail-open (exit 0)
// ---------------------------------------------------------------------------

describe('pre-tool-use hook — Edit with unknown phase (fail-open)', () => {
  it('exits with code 0 when phase is not in policy (fail-open behavior)', () => {
    const { exitCode } = runPreToolUse(
      { tool_name: 'Edit' },
      { FORJA_PHASE: 'unknown_phase' },
    );

    expect(exitCode).toBe(0);
  });
});
