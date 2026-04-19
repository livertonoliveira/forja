import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { TraceWriter } from '../../src/trace/writer.js';
import { readTrace, formatTrace } from '../../src/trace/reader.js';
import type { TraceEvent } from '../../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRootEvent(overrides: Partial<TraceEvent> & { ts: string; runId: string }): TraceEvent {
  return {
    ts: overrides.ts,
    runId: overrides.runId,
    eventType: overrides.eventType ?? 'phase_start',
    payload: overrides.payload ?? {},
    ...(overrides.spanId !== undefined ? { spanId: overrides.spanId } : {}),
    ...(overrides.commandFingerprint !== undefined
      ? { commandFingerprint: overrides.commandFingerprint }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// 1. formatTrace pretty — phase_start WITH commandFingerprint shows [fp: <hex>]
// ---------------------------------------------------------------------------

describe('formatTrace pretty — phase_start with commandFingerprint renders fingerprint suffix', () => {
  it('appends [fp: a1b2c3d4] to a phase_start line when commandFingerprint is present', async () => {
    const runId = randomUUID();
    const fp = 'a1b2c3d4';

    const events: TraceEvent[] = [
      makeRootEvent({
        ts: '2024-06-01T12:00:00.000Z',
        runId,
        eventType: 'phase_start',
        payload: { phase: 'develop' },
        commandFingerprint: fp,
      }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain(`[fp: ${fp}]`);
  });

  it('includes both phase= and [fp:] in the same line', async () => {
    const runId = randomUUID();
    const fp = 'deadbeef';

    const events: TraceEvent[] = [
      makeRootEvent({
        ts: '2024-06-01T12:00:00.000Z',
        runId,
        eventType: 'phase_start',
        payload: { phase: 'test' },
        commandFingerprint: fp,
      }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain('phase=test');
    expect(output).toContain('[fp: deadbeef]');
  });

  it('places [fp:] after phase= in the output line', async () => {
    const runId = randomUUID();
    const fp = 'cafebabe';

    const events: TraceEvent[] = [
      makeRootEvent({
        ts: '2024-06-01T12:00:00.000Z',
        runId,
        eventType: 'phase_start',
        payload: { phase: 'security' },
        commandFingerprint: fp,
      }),
    ];

    const output = await formatTrace(events, 'pretty');
    const phaseIdx = output.indexOf('phase=security');
    const fpIdx = output.indexOf('[fp:');
    expect(phaseIdx).toBeGreaterThanOrEqual(0);
    expect(fpIdx).toBeGreaterThanOrEqual(0);
    expect(fpIdx).toBeGreaterThan(phaseIdx);
  });
});

// ---------------------------------------------------------------------------
// 2. formatTrace pretty — phase_start WITHOUT commandFingerprint renders normally
// ---------------------------------------------------------------------------

describe('formatTrace pretty — phase_start without commandFingerprint renders no fingerprint suffix', () => {
  it('does not append [fp:] when commandFingerprint is absent', async () => {
    const runId = randomUUID();

    const events: TraceEvent[] = [
      makeRootEvent({
        ts: '2024-06-01T12:00:00.000Z',
        runId,
        eventType: 'phase_start',
        payload: { phase: 'develop' },
      }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).not.toContain('[fp:');
  });

  it('still renders phase= when commandFingerprint is absent', async () => {
    const runId = randomUUID();

    const events: TraceEvent[] = [
      makeRootEvent({
        ts: '2024-06-01T12:00:00.000Z',
        runId,
        eventType: 'phase_start',
        payload: { phase: 'review' },
      }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain('phase=review');
    expect(output).not.toContain('[fp:');
  });

  it('non-phase_start events with commandFingerprint do not render [fp:]', async () => {
    const runId = randomUUID();

    const events: TraceEvent[] = [
      {
        ts: '2024-06-01T12:00:00.000Z',
        runId,
        eventType: 'run_start',
        payload: {},
        commandFingerprint: 'shouldnotappear',
      },
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).not.toContain('[fp:');
  });
});

// ---------------------------------------------------------------------------
// 3. E2E — write JSONL with commandFingerprint, read with readTrace, format with formatTrace
// ---------------------------------------------------------------------------

describe('e2e — TraceWriter with commandFingerprint → readTrace → formatTrace pretty', () => {
  // Each test uses its own runId to avoid cross-test directory conflicts
  it('fingerprint written via TraceWriter appears in pretty-formatted output', async () => {
    const runId = randomUUID();
    const runDir = path.join('forja', 'state', 'runs', runId);
    try {
      const fp = 'f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0';
      const writer = new TraceWriter(runId);

      // Write a phase_start with a commandFingerprint
      await writer.writePhaseStart('develop', undefined, undefined, fp);

      // Confirm file was created
      const tracePath = path.join(runDir, 'trace.jsonl');
      await expect(fs.access(tracePath)).resolves.toBeUndefined();

      // Read trace back
      const events = await readTrace(runId);
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('phase_start');
      expect(events[0].commandFingerprint).toBe(fp);

      // Format and assert fingerprint appears
      const output = await formatTrace(events, 'pretty');
      expect(output).toContain(`[fp: ${fp}]`);
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });

  it('full run: phase_start with fp + phase_end without fp → only phase_start line has fingerprint', async () => {
    const runId = randomUUID();
    const runDir = path.join('forja', 'state', 'runs', runId);
    try {
      const fp = '1a2b3c4d1a2b3c4d1a2b3c4d1a2b3c4d';
      const writer = new TraceWriter(runId);

      await writer.writePhaseStart('test', undefined, undefined, fp);
      await writer.writePhaseEnd('test', 'success');

      const events = await readTrace(runId);
      expect(events).toHaveLength(2);

      const output = await formatTrace(events, 'pretty');
      const lines = output.split('\n');

      // First line (phase_start) contains fingerprint
      expect(lines[0]).toContain(`[fp: ${fp}]`);
      // Second line (phase_end) does not contain fingerprint
      expect(lines[1]).not.toContain('[fp:');
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });

  it('raw JSONL contains commandFingerprint field serialized correctly', async () => {
    const runId = randomUUID();
    const runDir = path.join('forja', 'state', 'runs', runId);
    try {
      const fp = 'abcdef01abcdef01abcdef01abcdef01';
      const writer = new TraceWriter(runId);
      await writer.writePhaseStart('perf', undefined, undefined, fp);

      const tracePath = path.join(runDir, 'trace.jsonl');
      const raw = await fs.readFile(tracePath, 'utf8');
      const parsed = JSON.parse(raw.trim());

      expect(parsed.commandFingerprint).toBe(fp);
      expect(parsed.eventType).toBe('phase_start');
    } finally {
      await fs.rm(runDir, { recursive: true, force: true });
    }
  });
});
