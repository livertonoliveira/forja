import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ZodError } from 'zod';
import { TraceWriter } from '../../src/trace/writer.js';
import { readTrace, formatTrace } from '../../src/trace/reader.js';
import { TraceEventSchema, CURRENT_SCHEMA_VERSION } from '../../src/schemas/index.js';
import type { Finding, GateDecision } from '../../src/schemas/index.js';

/** Read only the non-header lines from a trace.jsonl file. */
async function readTraceEventLines(traceFile: string): Promise<string[]> {
  const raw = await fs.readFile(traceFile, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter((l) => {
      try { return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header'; } catch { return false; }
    });
}

// Track run IDs created during tests so we can clean them up
const createdRunIds: string[] = [];

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function tracePath(runId: string): string {
  return path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
}

async function cleanupRun(runId: string): Promise<void> {
  try {
    await fs.rm(path.join('forja', 'state', 'runs', runId), { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

afterEach(async () => {
  // Clean up all run directories created during the test
  await Promise.all(createdRunIds.splice(0).map(cleanupRun));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(runId: string): Finding {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomUUID(),
    runId,
    phaseId: randomUUID(),
    severity: 'medium',
    category: 'security',
    title: 'Test finding',
    description: 'A test finding description',
    createdAt: new Date().toISOString(),
  };
}

function makeGateDecision(runId: string): GateDecision {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: randomUUID(),
    runId,
    decision: 'pass',
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    policyApplied: 'default',
    justification: null,
    decidedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 1. Writing a valid event produces a JSONL file with valid JSON on each line
// ---------------------------------------------------------------------------

describe('TraceWriter — valid event produces JSONL file', () => {
  it('creates a file with one valid JSON line after a single write', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('develop');

    const lines = await readTraceEventLines(tracePath(runId));
    expect(lines).toHaveLength(1);
    // Each line must be parseable JSON
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Each line parses successfully against TraceEventSchema
// ---------------------------------------------------------------------------

describe('TraceWriter — each line validates against TraceEventSchema', () => {
  it('written line matches TraceEventSchema', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('test-phase');

    const lines = await readTraceEventLines(tracePath(runId));
    for (const line of lines) {
      expect(() => TraceEventSchema.parse(JSON.parse(line))).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Writing an invalid event throws ZodError BEFORE writing to disk
// ---------------------------------------------------------------------------

describe('TraceWriter — invalid event throws ZodError before disk write', () => {
  it('throws ZodError and does not create the file when eventType is invalid', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await expect(
      // @ts-expect-error intentionally passing an invalid eventType
      writer.write({ runId, eventType: 'not_a_valid_type', payload: {} }),
    ).rejects.toBeInstanceOf(ZodError);

    // File must not exist
    await expect(fs.access(tracePath(runId))).rejects.toThrow();
  });

  it('throws ZodError when runId is not a valid UUID', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await expect(
      writer.write({ runId: 'not-a-uuid', eventType: 'phase_start', payload: { phase: 'x' } }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

// ---------------------------------------------------------------------------
// 4. File is append-only — multiple writes don't corrupt existing lines
// ---------------------------------------------------------------------------

describe('TraceWriter — append-only writes', () => {
  it('each write appends a new valid line without corrupting previous ones', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('develop');
    await writer.writePhaseEnd('develop', 'success');
    await writer.writeError(new Error('oops'), 'develop');

    const lines = await readTraceEventLines(tracePath(runId));

    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => TraceEventSchema.parse(JSON.parse(line))).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Convenience methods produce valid events
// ---------------------------------------------------------------------------

describe('TraceWriter — convenience methods', () => {
  it('writePhaseStart produces a valid phase_start event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('develop', randomUUID());

    const events = await readTrace(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('phase_start');
    expect(events[0].payload['phase']).toBe('develop');
  });

  it('writePhaseEnd produces a valid phase_end event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseEnd('test', 'failed');

    const events = await readTrace(runId);
    expect(events[0].eventType).toBe('phase_end');
    expect(events[0].payload['status']).toBe('failed');
  });

  it('writeToolCall produces a valid tool_call event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writeToolCall('Bash', randomUUID(), 1234);

    const events = await readTrace(runId);
    expect(events[0].eventType).toBe('tool_call');
    expect(events[0].payload['tool']).toBe('Bash');
    expect(events[0].payload['durationMs']).toBe(1234);
  });

  it('writeFinding produces a valid finding event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writeFinding(makeFinding(runId));

    const events = await readTrace(runId);
    expect(events[0].eventType).toBe('finding');
  });

  it('writeGateDecision produces a valid gate event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writeGateDecision(makeGateDecision(runId));

    const events = await readTrace(runId);
    expect(events[0].eventType).toBe('gate');
    expect(events[0].payload['decision']).toBe('pass');
  });

  it('writeCheckpoint produces a valid checkpoint event with checkpoint flag', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writeCheckpoint('security');

    const events = await readTrace(runId);
    expect(events[0].eventType).toBe('checkpoint');
    expect(events[0].payload['checkpoint']).toBe(true);
    expect(events[0].payload['phase']).toBe('security');
  });

  it('writeError produces a valid error event with message and stack', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    const err = new Error('something broke');
    await writer.writeError(err, 'review');

    const events = await readTrace(runId);
    expect(events[0].eventType).toBe('error');
    expect(events[0].payload['message']).toBe('something broke');
    expect(events[0].payload['phase']).toBe('review');
  });
});

// ---------------------------------------------------------------------------
// 6. readTrace reads JSONL and returns validated TraceEvent array
// ---------------------------------------------------------------------------

describe('readTrace', () => {
  it('returns an array of TraceEvents matching what was written', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('develop');
    await writer.writePhaseEnd('develop', 'success');

    const events = await readTrace(runId);
    expect(Array.isArray(events)).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe('phase_start');
    expect(events[1].eventType).toBe('phase_end');
    for (const e of events) {
      expect(e.runId).toBe(runId);
    }
  });

  it('validates every event against TraceEventSchema', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('perf');

    const events = await readTrace(runId);
    for (const e of events) {
      expect(() => TraceEventSchema.parse(e)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 7. formatTrace('json') returns valid JSON array
// ---------------------------------------------------------------------------

describe("formatTrace('json')", () => {
  it('returns a string that parses to an array of the same length', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('develop');
    await writer.writePhaseEnd('develop', 'success');

    const events = await readTrace(runId);
    const result = await formatTrace(events, 'json');
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(events.length);
  });
});

// ---------------------------------------------------------------------------
// 8. formatTrace('pretty') returns one line per event
// ---------------------------------------------------------------------------

describe("formatTrace('pretty')", () => {
  it('returns exactly one output line per event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('develop');
    await writer.writePhaseEnd('develop', 'success');
    await writer.writeError(new Error('boom'));

    const events = await readTrace(runId);
    const result = await formatTrace(events, 'pretty');
    const lines = result.split('\n').filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(events.length);
  });
});

// ---------------------------------------------------------------------------
// 9. formatTrace('md') returns a Markdown table with header row
// ---------------------------------------------------------------------------

describe("formatTrace('md')", () => {
  it('starts with a markdown table header row containing expected columns', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('develop');

    const events = await readTrace(runId);
    const result = await formatTrace(events, 'md');
    const lines = result.split('\n');

    // First line is the header
    expect(lines[0]).toContain('Timestamp');
    expect(lines[0]).toContain('Event Type');
    expect(lines[0]).toContain('Run ID');
    // Second line is the separator
    expect(lines[1]).toMatch(/^\|[-| ]+\|$/);
    // Data rows follow
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('contains one data row per event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('develop');
    await writer.writePhaseEnd('develop', 'success');

    const events = await readTrace(runId);
    const result = await formatTrace(events, 'md');
    const lines = result.split('\n').filter((l) => l.trim().startsWith('|'));

    // header + separator + data rows
    expect(lines).toHaveLength(events.length + 2);
  });
});
