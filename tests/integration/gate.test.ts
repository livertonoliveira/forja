/**
 * Integration tests for MOB-993 — `forja gate` CLI command.
 *
 * Each test writes a `findings.json` fixture directly to disk, then spawns
 * `node bin/forja gate --run <id>` and asserts:
 *   - The process exit code matches the gate decision
 *   - A `gate` TraceEvent is appended to `trace.jsonl`
 *
 * Exit-code contract:
 *   2  → critical or high findings present
 *   1  → only medium findings (no critical/high)
 *   0  → only low findings, or empty array
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { FindingSchema, type Finding } from '../../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(new URL('.', import.meta.url).pathname, '../..');
const BINARY = resolve(PROJECT_ROOT, 'bin/forja');
const TIMEOUT = 10_000;

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

function findingsPath(runId: string): string {
  return path.join(runDir(runId), 'findings.json');
}

function tracePath(runId: string): string {
  return path.join(runDir(runId), 'trace.jsonl');
}

function makeFinding(
  runId: string,
  severity: Finding['severity'],
): Finding {
  return FindingSchema.parse({
    id: randomUUID(),
    runId,
    phaseId: randomUUID(),
    severity,
    category: 'test',
    title: `Test ${severity} finding`,
    description: `A ${severity}-severity finding created by integration tests.`,
    createdAt: new Date().toISOString(),
  });
}

async function writeFindings(runId: string, findings: Finding[]): Promise<void> {
  const dir = runDir(runId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(findingsPath(runId), JSON.stringify(findings, null, 2), 'utf8');
}

function runGate(runId: string): ReturnType<typeof spawnSync> {
  return spawnSync('node', [BINARY, 'gate', '--run', runId], {
    timeout: TIMEOUT,
    encoding: 'utf-8',
    cwd: PROJECT_ROOT,
  });
}

async function readTraceEvents(runId: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(tracePath(runId), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

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
// Tests
// ---------------------------------------------------------------------------

describe('forja gate — exit codes', () => {
  it('exits with code 2 when findings.json contains a critical finding', () => {
    const runId = makeRunId();

    // Synchronously set up fixture before spawning (use spawnSync to keep things simple)
    spawnSync('node', ['-e', ''], { encoding: 'utf-8' }); // warm up
    const dir = runDir(runId);
    const dirResult = spawnSync(
      'node',
      ['-e', `require('fs').mkdirSync(${JSON.stringify(dir)}, { recursive: true }); require('fs').writeFileSync(${JSON.stringify(findingsPath(runId))}, ${JSON.stringify(JSON.stringify([makeFinding(runId, 'critical')]))}, 'utf8');`],
      { encoding: 'utf-8', cwd: PROJECT_ROOT },
    );
    expect(dirResult.error).toBeUndefined();

    const result = runGate(runId);
    expect(result.status).toBe(2);
  }, TIMEOUT);

  it('exits with code 2 when findings.json contains a high finding', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'high')]);

    const result = runGate(runId);
    expect(result.status).toBe(2);
  }, TIMEOUT);

  it('exits with code 2 when findings.json contains both critical and high findings', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [
      makeFinding(runId, 'critical'),
      makeFinding(runId, 'high'),
    ]);

    const result = runGate(runId);
    expect(result.status).toBe(2);
  }, TIMEOUT);

  it('exits with code 1 when only medium findings are present', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'medium')]);

    const result = runGate(runId);
    expect(result.status).toBe(1);
  }, TIMEOUT);

  it('exits with code 0 when findings.json is an empty array', async () => {
    const runId = makeRunId();
    await writeFindings(runId, []);

    const result = runGate(runId);
    expect(result.status).toBe(0);
  }, TIMEOUT);

  it('exits with code 0 when only low findings are present', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'low')]);

    const result = runGate(runId);
    expect(result.status).toBe(0);
  }, TIMEOUT);

  it('exits with code 0 when findings.json does not exist (no findings)', async () => {
    const runId = makeRunId();
    // Create the run dir but no findings.json — FindingWriter.readAll returns []
    await fs.mkdir(runDir(runId), { recursive: true });

    const result = runGate(runId);
    expect(result.status).toBe(0);
  }, TIMEOUT);
});

describe('forja gate — TraceEvent recording', () => {
  it('appends a gate TraceEvent to trace.jsonl after running gate', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'low')]);

    runGate(runId);

    const events = await readTraceEvents(runId);
    const gateEvents = events.filter((e) => e['eventType'] === 'gate');
    expect(gateEvents.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('gate TraceEvent payload contains decision=pass for empty findings', async () => {
    const runId = makeRunId();
    await writeFindings(runId, []);

    runGate(runId);

    const events = await readTraceEvents(runId);
    const gateEvent = events.find((e) => e['eventType'] === 'gate');
    expect(gateEvent).toBeDefined();
    const payload = gateEvent!['payload'] as Record<string, unknown>;
    expect(payload['decision']).toBe('pass');
    expect(payload['runId']).toBe(runId);
  }, TIMEOUT);

  it('gate TraceEvent payload contains decision=warn for medium findings', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'medium')]);

    runGate(runId);

    const events = await readTraceEvents(runId);
    const gateEvent = events.find((e) => e['eventType'] === 'gate');
    expect(gateEvent).toBeDefined();
    const payload = gateEvent!['payload'] as Record<string, unknown>;
    expect(payload['decision']).toBe('warn');
    expect(payload['mediumCount']).toBe(1);
  }, TIMEOUT);

  it('gate TraceEvent payload contains decision=fail for critical findings', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'critical')]);

    runGate(runId);

    const events = await readTraceEvents(runId);
    const gateEvent = events.find((e) => e['eventType'] === 'gate');
    expect(gateEvent).toBeDefined();
    const payload = gateEvent!['payload'] as Record<string, unknown>;
    expect(payload['decision']).toBe('fail');
    expect(payload['criticalCount']).toBe(1);
  }, TIMEOUT);

  it('gate TraceEvent payload contains decision=fail for high findings', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'high')]);

    runGate(runId);

    const events = await readTraceEvents(runId);
    const gateEvent = events.find((e) => e['eventType'] === 'gate');
    expect(gateEvent).toBeDefined();
    const payload = gateEvent!['payload'] as Record<string, unknown>;
    expect(payload['decision']).toBe('fail');
    expect(payload['highCount']).toBe(1);
  }, TIMEOUT);

  it('gate TraceEvent payload contains correct counts for mixed findings', async () => {
    const runId = makeRunId();
    await writeFindings(runId, [
      makeFinding(runId, 'critical'),
      makeFinding(runId, 'high'),
      makeFinding(runId, 'medium'),
      makeFinding(runId, 'low'),
      makeFinding(runId, 'low'),
    ]);

    runGate(runId);

    const events = await readTraceEvents(runId);
    const gateEvent = events.find((e) => e['eventType'] === 'gate');
    expect(gateEvent).toBeDefined();
    const payload = gateEvent!['payload'] as Record<string, unknown>;
    expect(payload['decision']).toBe('fail');
    expect(payload['criticalCount']).toBe(1);
    expect(payload['highCount']).toBe(1);
    expect(payload['mediumCount']).toBe(1);
    expect(payload['lowCount']).toBe(2);
  }, TIMEOUT);

  it('gate TraceEvent has a valid ISO timestamp (ts field)', async () => {
    const runId = makeRunId();
    await writeFindings(runId, []);

    runGate(runId);

    const events = await readTraceEvents(runId);
    const gateEvent = events.find((e) => e['eventType'] === 'gate');
    expect(gateEvent).toBeDefined();
    expect(typeof gateEvent!['ts']).toBe('string');
    expect(() => new Date(gateEvent!['ts'] as string).toISOString()).not.toThrow();
  }, TIMEOUT);
});

// ---------------------------------------------------------------------------
// Custom policy file
// ---------------------------------------------------------------------------

describe('forja gate — custom policy file', () => {
  const createdPolicyFiles: string[] = [];

  afterEach(async () => {
    for (const file of createdPolicyFiles.splice(0)) {
      try {
        await fs.rm(file, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  async function writeCustomPolicy(content: string): Promise<string> {
    const policyPath = path.join(PROJECT_ROOT, `policies/test-custom-${randomUUID()}.yaml`);
    await fs.mkdir(path.dirname(policyPath), { recursive: true });
    await fs.writeFile(policyPath, content, 'utf8');
    createdPolicyFiles.push(policyPath);
    return policyPath;
  }

  function runGateWithPolicy(runId: string, policyPath: string): ReturnType<typeof spawnSync> {
    return spawnSync('node', [BINARY, 'gate', '--run', runId, '--policy', policyPath], {
      timeout: TIMEOUT,
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
    });
  }

  it('exits with code 2 when using custom policy that maps medium to fail_gate', async () => {
    const policyPath = await writeCustomPolicy(`
version: "1"
policies:
  - name: custom-medium-fail
    when:
      finding.severity: medium
    then:
      - action: fail_gate
`);
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'medium')]);

    const result = runGateWithPolicy(runId, policyPath);
    expect(result.status).toBe(2);
  }, TIMEOUT);

  it('exits with code 0 when using custom policy that ignores critical findings', async () => {
    const policyPath = await writeCustomPolicy(`
version: "1"
policies:
  - name: custom-all-pass
    when:
      finding.severity: critical
    then:
      - action: pass_gate
`);
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'critical')]);

    const result = runGateWithPolicy(runId, policyPath);
    expect(result.status).toBe(0);
  }, TIMEOUT);

  it('records the custom policy path in the gate TraceEvent payload', async () => {
    const policyPath = await writeCustomPolicy(`
version: "1"
policies:
  - name: custom-warn
    when:
      finding.severity: low
    then:
      - action: warn_gate
`);
    const runId = makeRunId();
    await writeFindings(runId, [makeFinding(runId, 'low')]);

    runGateWithPolicy(runId, policyPath);

    const events = await readTraceEvents(runId);
    const gateEvent = events.find((e) => e['eventType'] === 'gate');
    expect(gateEvent).toBeDefined();
    const payload = gateEvent!['payload'] as Record<string, unknown>;
    expect(payload['policyApplied']).toBe(policyPath);
  }, TIMEOUT);
});
