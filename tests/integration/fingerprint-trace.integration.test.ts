/**
 * Integration tests for MOB-1012 — trace fingerprint flow.
 *
 * Tests cover:
 *  1. When the command file exists, phase_start trace event includes
 *     commandFingerprint (32-char hex string)
 *  2. When the command file does NOT exist, phase_start event still emits
 *     (no crash) and commandFingerprint is absent/undefined
 *  3. TraceWriter.writePhaseStart correctly passes commandFingerprint through
 *     to the written JSONL event
 *  4. readTrace can parse events that include commandFingerprint (schema
 *     validation passes for events with and without the field)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { TraceWriter } from '../../src/trace/writer.js';
import { readTrace } from '../../src/trace/reader.js';
import { TraceEventSchema } from '../../src/schemas/index.js';
import type { ForjaStore } from '../../src/store/interface.js';
import type { Run } from '../../src/store/types.js';

// ---------------------------------------------------------------------------
// vi.mock must be declared at module top-level — Vitest hoists it.
// We mock fingerprintCommand so PipelineFSM tests control whether the file
// "exists" without touching the real filesystem or calling process.chdir().
// ---------------------------------------------------------------------------

const { fingerprintCommandMock } = vi.hoisted(() => ({
  fingerprintCommandMock: vi.fn<[string], Promise<string>>(),
}));

vi.mock('../../src/engine/fingerprint.js', () => ({
  fingerprintCommand: fingerprintCommandMock,
  fingerprintAllCommands: vi.fn(),
}));

// Import AFTER vi.mock (Vitest hoists the mock)
import { PipelineFSM } from '../../src/engine/fsm.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Cleanup all created run dirs after each test
import { afterEach } from 'vitest';
afterEach(async () => {
  await Promise.all(createdRunIds.splice(0).map(cleanupRun));
});

// ---------------------------------------------------------------------------
// FSM store mock helper
// ---------------------------------------------------------------------------

function makeRun(runId: string, status: Run['status']): Run {
  return {
    id: runId,
    issueId: 'MOB-1012',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status,
    gitBranch: null,
    gitSha: null,
    model: null,
    totalCost: '0',
    totalTokens: 0,
  };
}

function makeStore(runId: string, initialStatus: Run['status']): ForjaStore {
  let currentStatus = initialStatus;
  return {
    getRun: vi.fn(async () => makeRun(runId, currentStatus)),
    transitionRunStatus: vi.fn(async (_id, _from, to) => {
      currentStatus = to;
      return makeRun(runId, currentStatus);
    }),
    createRun: vi.fn(),
    updateRun: vi.fn(),
    listRuns: vi.fn(),
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
    deleteRunsBefore: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
  } as unknown as ForjaStore;
}

// ---------------------------------------------------------------------------
// 1. TraceWriter.writePhaseStart — commandFingerprint is written to JSONL
// ---------------------------------------------------------------------------

describe('TraceWriter.writePhaseStart — commandFingerprint field', () => {
  it('includes commandFingerprint in the written JSONL event when provided', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    const fingerprint = 'abcdef1234567890abcdef1234567890'; // 32-char hex

    await writer.writePhaseStart('dev', undefined, undefined, fingerprint);

    const raw = await fs.readFile(tracePath(runId), 'utf8');
    const eventLine = raw.split('\n').filter((l) => l.trim() && !l.includes('"type":"header"'))[0];
    const parsed = JSON.parse(eventLine);

    expect(parsed.commandFingerprint).toBe(fingerprint);
    expect(parsed.eventType).toBe('phase_start');
    expect(parsed.payload.phase).toBe('dev');
  });

  it('omits commandFingerprint from the written event when not provided', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('dev');

    const raw = await fs.readFile(tracePath(runId), 'utf8');
    const eventLine = raw.split('\n').filter((l) => l.trim() && !l.includes('"type":"header"'))[0];
    const parsed = JSON.parse(eventLine);

    expect(parsed.commandFingerprint).toBeUndefined();
    expect(parsed.eventType).toBe('phase_start');
  });

  it('written event with commandFingerprint validates against TraceEventSchema', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    const fingerprint = 'deadbeef01234567deadbeef01234567';

    await writer.writePhaseStart('test', undefined, undefined, fingerprint);

    const raw = await fs.readFile(tracePath(runId), 'utf8');
    const eventLine = raw.split('\n').filter((l) => l.trim() && !l.includes('"type":"header"'))[0];
    const parsed = JSON.parse(eventLine);

    expect(() => TraceEventSchema.parse(parsed)).not.toThrow();
    const validated = TraceEventSchema.parse(parsed);
    expect(validated.commandFingerprint).toBe(fingerprint);
  });
});

// ---------------------------------------------------------------------------
// 2. readTrace — schema validation passes for events with commandFingerprint
// ---------------------------------------------------------------------------

describe('readTrace — commandFingerprint schema compatibility', () => {
  it('parses a phase_start event with commandFingerprint without throwing', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);
    const fingerprint = 'cafe00112233aabbcafe00112233aabb';

    await writer.writePhaseStart('security', undefined, undefined, fingerprint);

    const events = await readTrace(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('phase_start');
    expect(events[0].commandFingerprint).toBe(fingerprint);
  });

  it('parses a phase_start event without commandFingerprint without throwing', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('review');

    const events = await readTrace(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('phase_start');
    expect(events[0].commandFingerprint).toBeUndefined();
  });

  it('validates every event in a mixed trace (with and without fingerprint)', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('dev', undefined, undefined, 'aaaa1111bbbb2222aaaa1111bbbb2222');
    await writer.writePhaseStart('test'); // no fingerprint
    await writer.writePhaseEnd('dev', 'success');

    const events = await readTrace(runId);
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(() => TraceEventSchema.parse(event)).not.toThrow();
    }

    expect(events[0].commandFingerprint).toBe('aaaa1111bbbb2222aaaa1111bbbb2222');
    expect(events[1].commandFingerprint).toBeUndefined();
    expect(events[2].commandFingerprint).toBeUndefined();
  });

  it('commandFingerprint value matches the expected 32-char hex pattern', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    // Simulate a fingerprint produced by fingerprintCommand (SHA-256 first 32 hex chars)
    const fingerprint = '0123456789abcdef0123456789abcdef';
    await writer.writePhaseStart('perf', undefined, undefined, fingerprint);

    const events = await readTrace(runId);
    expect(events[0].commandFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ---------------------------------------------------------------------------
// 3. PipelineFSM.transition — commandFingerprint in phase_start when file exists
// ---------------------------------------------------------------------------

describe('PipelineFSM.transition — command file exists (mocked)', () => {
  const FAKE_FINGERPRINT = 'aabbccdd11223344aabbccdd11223344';

  beforeEach(() => {
    fingerprintCommandMock.mockReset();
    fingerprintCommandMock.mockResolvedValue(FAKE_FINGERPRINT);
  });

  it('calls fingerprintCommand with the correct path for the phase', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('dev');

    expect(fingerprintCommandMock).toHaveBeenCalledOnce();
    const calledPath: string = fingerprintCommandMock.mock.calls[0]![0];
    expect(calledPath).toMatch(/\.claude[/\\]commands[/\\]forja[/\\]dev\.md$/);
  });

  it('includes a 32-char hex commandFingerprint in the written phase_start event', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('dev');

    const events = await readTrace(runId);
    const phaseStartEvent = events.find((e) => e.eventType === 'phase_start');

    expect(phaseStartEvent).toBeDefined();
    expect(phaseStartEvent!.commandFingerprint).toBe(FAKE_FINGERPRINT);
    expect(phaseStartEvent!.commandFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it('phase_start payload contains the correct phase name', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'dev');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('test');

    const events = await readTrace(runId);
    const phaseStartEvent = events.find((e) => e.eventType === 'phase_start');

    expect(phaseStartEvent!.payload['phase']).toBe('test');
    expect(phaseStartEvent!.commandFingerprint).toBe(FAKE_FINGERPRINT);
  });

  it('phase_start event with fingerprint validates against TraceEventSchema', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('dev');

    const events = await readTrace(runId);
    for (const event of events) {
      expect(() => TraceEventSchema.parse(event)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. PipelineFSM.transition — command file does NOT exist (no crash)
// ---------------------------------------------------------------------------

describe('PipelineFSM.transition — command file does not exist (mocked)', () => {
  beforeEach(() => {
    fingerprintCommandMock.mockReset();
    // Simulate the file not existing: fingerprintCommand throws ENOENT
    fingerprintCommandMock.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
    );
  });

  it('does not throw when fingerprintCommand rejects (file missing)', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await expect(fsm.transition('dev')).resolves.toBeUndefined();
  });

  it('still emits a phase_start event when the command file is missing', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('dev');

    const events = await readTrace(runId);
    const phaseStartEvent = events.find((e) => e.eventType === 'phase_start');

    expect(phaseStartEvent).toBeDefined();
    expect(phaseStartEvent!.payload['phase']).toBe('dev');
  });

  it('phase_start event has commandFingerprint=undefined when command file is missing', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('dev');

    const events = await readTrace(runId);
    const phaseStartEvent = events.find((e) => e.eventType === 'phase_start');

    expect(phaseStartEvent).toBeDefined();
    expect(phaseStartEvent!.commandFingerprint).toBeUndefined();
  });

  it('phase_start event still validates against TraceEventSchema when fingerprint is absent', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('dev');

    const events = await readTrace(runId);
    for (const event of events) {
      expect(() => TraceEventSchema.parse(event)).not.toThrow();
    }
  });

  it('FSM state is still transitioned correctly even when fingerprinting fails', async () => {
    const runId = makeRunId();
    const store = makeStore(runId, 'init');
    const fsm = new PipelineFSM(store, runId);

    await fsm.transition('dev');

    expect(store.transitionRunStatus).toHaveBeenCalledWith(runId, 'init', 'dev');
  });
});
