import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { TraceWriter } from '../../src/trace/writer.js';
import { TraceEventSchema } from '../../src/schemas/index.js';
import { makeRunId, tracePath } from './_helpers.js';

/** Read only the trace event lines (skip the header line). */
async function readTraceEventLines(runId: string): Promise<string[]> {
  const raw = await fs.readFile(tracePath(runId), 'utf8');
  return raw
    .split('\n')
    .filter(l => l.trim() !== '')
    .filter(l => {
      try {
        return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header';
      } catch {
        return false;
      }
    });
}

describe('TraceWriter contract — 5 event types each parse against TraceEventSchema', () => {
  it('writes exactly 5 lines and every line parses against TraceEventSchema', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('perf');
    await writer.writePhaseEnd('perf', 'success');
    await writer.writeToolCall('Read', randomUUID(), 120);
    await writer.writeCheckpoint('perf');
    await writer.writeError(new Error('test error'), 'perf');

    const lines = await readTraceEventLines(runId);

    expect(lines).toHaveLength(5);
    for (const line of lines) {
      expect(() => TraceEventSchema.parse(JSON.parse(line))).not.toThrow();
    }
  });
});

describe('TraceWriter contract — writePhaseStart payload fields', () => {
  it('phase_start event contains phase in payload', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('security');

    const lines = await readTraceEventLines(runId);
    const parsed = TraceEventSchema.parse(JSON.parse(lines[0]));

    expect(parsed).toMatchObject({ eventType: 'phase_start', runId, payload: { phase: 'security' } });
    expect(parsed.ts).toBeDefined();
  });
});

describe('TraceWriter contract — writePhaseEnd payload fields', () => {
  it('phase_end event contains phase and status in payload', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseEnd('review', 'failed');

    const lines = await readTraceEventLines(runId);
    const parsed = TraceEventSchema.parse(JSON.parse(lines[0]));

    expect(parsed).toMatchObject({ eventType: 'phase_end', runId, payload: { phase: 'review', status: 'failed' } });
  });
});

describe('TraceWriter contract — writeToolCall payload fields', () => {
  it('tool_call event contains tool and durationMs in payload', async () => {
    const runId = makeRunId();
    const agentId = randomUUID();
    const writer = new TraceWriter(runId);

    await writer.writeToolCall('Bash', agentId, 250);

    const lines = await readTraceEventLines(runId);
    const parsed = TraceEventSchema.parse(JSON.parse(lines[0]));

    expect(parsed).toMatchObject({ eventType: 'tool_call', runId, agentId, payload: { tool: 'Bash', durationMs: 250 } });
  });
});

describe('TraceWriter contract — writeCheckpoint payload fields', () => {
  it('checkpoint event contains checkpoint flag and phase in payload', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writeCheckpoint('perf');

    const lines = await readTraceEventLines(runId);
    const parsed = TraceEventSchema.parse(JSON.parse(lines[0]));

    expect(parsed).toMatchObject({ eventType: 'checkpoint', runId, payload: { checkpoint: true, phase: 'perf' } });
  });
});

describe('TraceWriter contract — writeError payload fields', () => {
  it('error event contains message in payload', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writeError(new Error('something went wrong'), 'security');

    const lines = await readTraceEventLines(runId);
    const parsed = TraceEventSchema.parse(JSON.parse(lines[0]));

    expect(parsed).toMatchObject({ eventType: 'error', runId, payload: { message: 'something went wrong', phase: 'security' } });
  });
});
