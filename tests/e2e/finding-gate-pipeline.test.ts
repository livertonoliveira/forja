/**
 * E2E tests for MOB-993 — full FindingWriter → gate pipeline.
 *
 * Exercises the complete chain:
 *   FindingWriter.write() → flush() → findings.json + trace.jsonl (finding events)
 *   → gate (subprocess) → exit code 2 + trace.jsonl (gate event)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';

import { FindingWriter } from '../../src/trace/finding-writer.js';
import { readTrace } from '../../src/trace/reader.js';
import { FindingSchema, TraceEventSchema } from '../../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createdRunIds: string[] = [];

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function makePhaseId(): string {
  return randomUUID();
}

function runDir(runId: string): string {
  return path.join('forja', 'state', 'runs', runId);
}

function findingsPath(runId: string): string {
  return path.join(runDir(runId), 'findings.json');
}

/** Absolute path to the tsx binary bundled with this project */
const TSX = path.resolve('node_modules/.bin/tsx');

/**
 * Minimal gate runner — avoids importing src/cli/index.ts which requires
 * __FORJA_VERSION__ to be defined at build time (esbuild injection).
 */
const CLI_ENTRY = path.resolve('tests/e2e/_gate-runner.ts');

/** Absolute project root — required because the writer resolves paths relative to cwd */
const PROJECT_ROOT = path.resolve('.');

/**
 * Spawn `forja gate --run <runId>` via tsx as a subprocess.
 * Returns { exitCode, stdout, stderr }.
 */
function runGate(runId: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(TSX, [CLI_ENTRY, '--run', runId], {
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
// Scenario 1: full pipeline — 1 high + 1 medium + 1 low → gate fails (exit 2)
// ---------------------------------------------------------------------------

describe('E2E: FindingWriter → gate pipeline with mixed severities', () => {
  it('writes 3 findings, gate exits 2, trace has 3 finding + 1 gate event', async () => {
    const runId = makeRunId();
    const phaseId = makePhaseId();

    // Step 1 — Create FindingWriter and write 3 findings
    const writer = new FindingWriter(runId, phaseId);

    await writer.write({
      severity: 'high',
      category: 'security',
      title: 'SQL Injection detected',
      description: 'Unsanitized user input passed to SQL query',
    });

    await writer.write({
      severity: 'medium',
      category: 'performance',
      title: 'N+1 query in loop',
      description: 'Database query executed inside a loop without batching',
    });

    await writer.write({
      severity: 'low',
      category: 'style',
      title: 'Missing trailing newline',
      description: 'File does not end with a newline character',
    });

    // Step 2 — flush() persists findings.json and appends to trace.jsonl
    await writer.flush();

    // Step 3 — findings.json exists and contains 3 valid findings
    const rawFindings = await fs.readFile(findingsPath(runId), 'utf8');
    const parsedFindings = JSON.parse(rawFindings) as unknown[];
    expect(parsedFindings).toHaveLength(3);
    for (const item of parsedFindings) {
      expect(() => FindingSchema.parse(item)).not.toThrow();
    }

    // Step 4 — FindingWriter.readAll() returns all 3 findings with correct fields
    const allFindings = await FindingWriter.readAll(runId);
    expect(allFindings).toHaveLength(3);

    const severities = allFindings.map(f => f.severity).sort();
    expect(severities).toEqual(['high', 'low', 'medium']);

    for (const finding of allFindings) {
      expect(finding.runId).toBe(runId);
      expect(finding.phaseId).toBe(phaseId);
      expect(finding.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(finding.createdAt).toBeTruthy();
      expect(() => FindingSchema.parse(finding)).not.toThrow();
    }

    // Step 5 — trace.jsonl contains exactly 3 'finding' events after flush()
    const eventsAfterFlush = await readTrace(runId);
    expect(eventsAfterFlush).toHaveLength(3);
    for (const event of eventsAfterFlush) {
      expect(() => TraceEventSchema.parse(event)).not.toThrow();
      expect(event.eventType).toBe('finding');
      expect(event.runId).toBe(runId);
    }

    // Step 6 — run gate subprocess; expect exit code 2 (high finding present)
    const { exitCode, stdout } = runGate(runId);
    expect(exitCode).toBe(2);
    expect(stdout).toContain('fail');
    expect(stdout).toContain('high=1');

    // Step 7 — trace.jsonl now has 3 finding events + 1 gate event (total 4)
    const eventsAfterGate = await readTrace(runId);
    expect(eventsAfterGate).toHaveLength(4);

    const gateEvents = eventsAfterGate.filter(e => e.eventType === 'gate');
    expect(gateEvents).toHaveLength(1);

    const gateEvent = gateEvents[0];
    expect(() => TraceEventSchema.parse(gateEvent)).not.toThrow();
    expect(gateEvent.payload['decision']).toBe('fail');
    expect(gateEvent.payload['highCount']).toBe(1);
    expect(gateEvent.payload['mediumCount']).toBe(1);
    expect(gateEvent.payload['lowCount']).toBe(1);
    expect(gateEvent.payload['criticalCount']).toBe(0);
    expect(gateEvent.runId).toBe(runId);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: only medium findings → gate warns (exit 1)
// ---------------------------------------------------------------------------

describe('E2E: gate warns (exit 1) when only medium findings are present', () => {
  it('gate exits 1 and gate event has decision: warn', async () => {
    const runId = makeRunId();
    const phaseId = makePhaseId();

    const writer = new FindingWriter(runId, phaseId);
    await writer.write({
      severity: 'medium',
      category: 'performance',
      title: 'Slow regex',
      description: 'ReDoS-prone regular expression',
    });
    await writer.flush();

    const { exitCode } = runGate(runId);
    expect(exitCode).toBe(1);

    const events = await readTrace(runId);
    const gateEvents = events.filter(e => e.eventType === 'gate');
    expect(gateEvents).toHaveLength(1);
    expect(gateEvents[0].payload['decision']).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: only low findings → gate passes (exit 0)
// ---------------------------------------------------------------------------

describe('E2E: gate passes (exit 0) when only low findings are present', () => {
  it('gate exits 0 and gate event has decision: pass', async () => {
    const runId = makeRunId();
    const phaseId = makePhaseId();

    const writer = new FindingWriter(runId, phaseId);
    await writer.write({
      severity: 'low',
      category: 'style',
      title: 'Unused import',
      description: 'An import statement that is never used',
    });
    await writer.flush();

    const { exitCode } = runGate(runId);
    expect(exitCode).toBe(0);

    const events = await readTrace(runId);
    const gateEvents = events.filter(e => e.eventType === 'gate');
    expect(gateEvents).toHaveLength(1);
    expect(gateEvents[0].payload['decision']).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: no findings at all → gate passes (exit 0)
// ---------------------------------------------------------------------------

describe('E2E: gate passes (exit 0) when no findings exist', () => {
  it('gate exits 0 with pass decision and 0 counts', async () => {
    const runId = makeRunId();
    const phaseId = makePhaseId();

    // flush with no findings written — creates an empty findings.json
    const writer = new FindingWriter(runId, phaseId);
    await writer.flush();

    const allFindings = await FindingWriter.readAll(runId);
    expect(allFindings).toHaveLength(0);

    const { exitCode } = runGate(runId);
    expect(exitCode).toBe(0);

    const events = await readTrace(runId);
    const gateEvents = events.filter(e => e.eventType === 'gate');
    expect(gateEvents).toHaveLength(1);
    expect(gateEvents[0].payload['decision']).toBe('pass');
    expect(gateEvents[0].payload['criticalCount']).toBe(0);
    expect(gateEvents[0].payload['highCount']).toBe(0);
    expect(gateEvents[0].payload['mediumCount']).toBe(0);
    expect(gateEvents[0].payload['lowCount']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: critical finding → gate fails (exit 2)
// ---------------------------------------------------------------------------

describe('E2E: gate fails (exit 2) when critical finding is present', () => {
  it('gate exits 2 and gate event reflects critical=1', async () => {
    const runId = makeRunId();
    const phaseId = makePhaseId();

    const writer = new FindingWriter(runId, phaseId);
    await writer.write({
      severity: 'critical',
      category: 'security',
      title: 'Remote code execution',
      description: 'Arbitrary code execution via deserialization',
    });
    await writer.flush();

    const { exitCode, stdout } = runGate(runId);
    expect(exitCode).toBe(2);
    expect(stdout).toContain('fail');

    const events = await readTrace(runId);
    const gateEvents = events.filter(e => e.eventType === 'gate');
    expect(gateEvents).toHaveLength(1);
    expect(gateEvents[0].payload['decision']).toBe('fail');
    expect(gateEvents[0].payload['criticalCount']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: FindingWriter.readAll() returns empty array when no file exists
// ---------------------------------------------------------------------------

describe('E2E: FindingWriter.readAll() returns [] for non-existent run', () => {
  it('does not throw and returns an empty array', async () => {
    const runId = makeRunId(); // directory never created
    const findings = await FindingWriter.readAll(runId);
    expect(findings).toEqual([]);
  });
});
