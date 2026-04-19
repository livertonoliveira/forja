/**
 * E2E tests for `forja gate` command — MOB-1003.
 *
 * Tests the gate command end-to-end:
 *   - Creates a temporary run directory with mock findings
 *   - Spawns the gate CLI as a subprocess (via tsx + _gate-runner.ts)
 *   - Asserts the exit code based on finding severity
 *   - Tests custom --policy flag with a temp YAML file
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';

import { FindingWriter } from '../../trace/finding-writer.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute project root — cwd for subprocess and relative path resolution */
const PROJECT_ROOT = path.resolve('.');

/** Path to the tsx binary */
const TSX = path.resolve('node_modules/.bin/tsx');

/**
 * Minimal gate runner that avoids importing src/cli/index.ts (which requires
 * __FORJA_VERSION__ to be defined at build time via esbuild injection).
 */
const GATE_RUNNER = path.resolve('tests/e2e/_gate-runner.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createdRunIds: string[] = [];

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function runDir(runId: string): string {
  return path.join(PROJECT_ROOT, 'forja', 'state', 'runs', runId);
}

/**
 * Spawn `forja gate --run <runId> [--policy <policyPath>]` via tsx.
 */
function runGate(
  runId: string,
  opts: { policyPath?: string } = {},
): { exitCode: number; stdout: string; stderr: string } {
  const args = [GATE_RUNNER, '--run', runId];
  if (opts.policyPath) {
    args.push('--policy', opts.policyPath);
  }
  const result = spawnSync(TSX, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

afterEach(async () => {
  for (const runId of createdRunIds.splice(0)) {
    try {
      await fs.rm(runDir(runId), { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

// ---------------------------------------------------------------------------
// Scenario 1: critical finding → exit code 2 (fail)
// ---------------------------------------------------------------------------

describe('gate command — critical finding', () => {
  it('exits with code 2 when a critical finding is present', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();

    const writer = new FindingWriter(runId, phaseId);
    writer.write({
      severity: 'critical',
      category: 'security',
      title: 'Remote Code Execution',
      description: 'Arbitrary code execution via unsafe deserialization',
    });
    await writer.flush();

    const { exitCode, stdout } = runGate(runId);

    expect(exitCode).toBe(2);
    expect(stdout).toContain('fail');
    expect(stdout).toContain('critical=1');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: medium finding → exit code 1 (warn)
// ---------------------------------------------------------------------------

describe('gate command — medium finding', () => {
  it('exits with code 1 when a medium finding is present', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();

    const writer = new FindingWriter(runId, phaseId);
    writer.write({
      severity: 'medium',
      category: 'performance',
      title: 'N+1 Query Detected',
      description: 'Database query executed inside a loop without batching',
    });
    await writer.flush();

    const { exitCode, stdout } = runGate(runId);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('warn');
    expect(stdout).toContain('medium=1');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: empty findings → exit code 0 (pass)
// ---------------------------------------------------------------------------

describe('gate command — no findings', () => {
  it('exits with code 0 when there are no findings', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();

    // Flush with no findings written — creates an empty findings.json
    const writer = new FindingWriter(runId, phaseId);
    await writer.flush();

    const { exitCode, stdout } = runGate(runId);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('pass');
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: custom --policy with fail_gate rule for medium → exit code 2
// ---------------------------------------------------------------------------

describe('gate command — custom --policy flag', () => {
  let tmpPolicyPath: string;

  afterEach(async () => {
    if (tmpPolicyPath) {
      try {
        await fs.unlink(tmpPolicyPath);
      } catch {
        // ignore if already deleted
      }
    }
  });

  it('uses custom policy that escalates medium to fail_gate → exits 2', async () => {
    // Write a custom policy that treats medium findings as fail_gate
    tmpPolicyPath = path.join(PROJECT_ROOT, `forja-test-policy-${randomUUID()}.yaml`);
    const customPolicy = `version: "1"
policies:
  - name: escalate-medium
    when:
      finding.severity: medium
    then:
      - action: fail_gate
`;
    await fs.writeFile(tmpPolicyPath, customPolicy, 'utf-8');

    const runId = makeRunId();
    const phaseId = randomUUID();

    const writer = new FindingWriter(runId, phaseId);
    writer.write({
      severity: 'medium',
      category: 'quality',
      title: 'Missing Input Validation',
      description: 'User input is not validated before processing',
    });
    await writer.flush();

    const { exitCode, stdout } = runGate(runId, { policyPath: tmpPolicyPath });

    expect(exitCode).toBe(2);
    expect(stdout).toContain('fail');
  });

  it('uses custom policy that has no rules → exits 0 (pass by default)', async () => {
    // A policy with no matching rules → no actions → decision defaults to pass
    tmpPolicyPath = path.join(PROJECT_ROOT, `forja-test-policy-${randomUUID()}.yaml`);
    const emptyPolicy = `version: "1"
policies: []
`;
    await fs.writeFile(tmpPolicyPath, emptyPolicy, 'utf-8');

    const runId = makeRunId();
    const phaseId = randomUUID();

    const writer = new FindingWriter(runId, phaseId);
    writer.write({
      severity: 'critical',
      category: 'security',
      title: 'Critical Vulnerability',
      description: 'This would normally fail but policy has no rules',
    });
    await writer.flush();

    const { exitCode, stdout } = runGate(runId, { policyPath: tmpPolicyPath });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('pass');
  });
});
