import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatTrace } from '../../src/trace/reader.js';
import { TraceEvent } from '../../src/schemas/index.js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<TraceEvent> & { ts: string }): TraceEvent {
  return {
    ts: overrides.ts,
    runId: overrides.runId ?? randomUUID(),
    eventType: overrides.eventType ?? 'tool_call',
    payload: overrides.payload ?? {},
    ...(overrides.spanId !== undefined ? { spanId: overrides.spanId } : {}),
    ...(overrides.phaseId !== undefined ? { phaseId: overrides.phaseId } : {}),
    ...(overrides.agentId !== undefined ? { agentId: overrides.agentId } : {}),
  };
}

const RUN_ID = randomUUID();

// ---------------------------------------------------------------------------
// 1. Events without spanId render flat (original behavior preserved)
// ---------------------------------------------------------------------------

describe('formatTrace pretty — root events (no spanId) render flat', () => {
  it('renders a single root event without tree prefix', async () => {
    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, eventType: 'run_start', payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toBe(`[2024-01-01T10:00:00.000Z] run_start run=${RUN_ID}`);
  });

  it('does not include [span:] prefix for root events', async () => {
    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, eventType: 'cost', payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).not.toContain('[span:');
    expect(output).not.toContain('├─');
    expect(output).not.toContain('└─');
  });

  it('renders phase field when present in payload', async () => {
    const events: TraceEvent[] = [
      makeEvent({
        ts: '2024-01-01T10:00:00.000Z',
        runId: RUN_ID,
        eventType: 'phase_start',
        payload: { phase: 'develop' },
      }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain('phase=develop');
  });
});

// ---------------------------------------------------------------------------
// 2. Events with spanId show [span:XXXXXX] prefix (first 6 chars)
// ---------------------------------------------------------------------------

describe('formatTrace pretty — span events include [span:XXXXXX] label', () => {
  it('includes [span:] label with first 6 chars of spanId', async () => {
    const spanId = 'abcdef1234567890';
    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, spanId, payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain('[span:abcdef]');
  });

  it('truncates spanId to exactly 6 characters in the label', async () => {
    const spanId = 'xyz9876543210000';
    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, spanId, payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain('[span:xyz987]');
    expect(output).not.toContain('[span:xyz9876]');
  });
});

// ---------------------------------------------------------------------------
// 3. Multi-event span shows ├─ for all but last, └─ for last
// ---------------------------------------------------------------------------

describe('formatTrace pretty — multi-event span uses correct tree connectors', () => {
  it('uses ├─ for all events except the last in a span', async () => {
    const spanId = 'span00001234abcd';
    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, spanId, eventType: 'phase_start', payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:01.000Z', runId: RUN_ID, spanId, eventType: 'tool_call', payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:02.000Z', runId: RUN_ID, spanId, eventType: 'phase_end', payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    const lines = output.split('\n');

    expect(lines[0]).toContain('├─');
    expect(lines[1]).toContain('├─');
    expect(lines[2]).toContain('└─');
  });

  it('uses └─ only for the last event in a span', async () => {
    const spanId = 'span00005678abcd';
    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, spanId, payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:01.000Z', runId: RUN_ID, spanId, payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    const lines = output.split('\n');

    expect(lines[0]).toContain('├─');
    expect(lines[1]).toContain('└─');

    // only one └─ in total
    const lastLineCount = lines.filter((l) => l.includes('└─')).length;
    expect(lastLineCount).toBe(1);
  });

  it('a single-event span uses └─ (not ├─)', async () => {
    const spanId = 'singleevent01234';
    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, spanId, payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain('└─');
    expect(output).not.toContain('├─');
  });
});

// ---------------------------------------------------------------------------
// 4. Events from different spans appear as separate groups
// ---------------------------------------------------------------------------

describe('formatTrace pretty — separate spans form separate groups', () => {
  it('renders each span as its own group with its own [span:] label', async () => {
    const spanA = 'aaaa001234567890';
    const spanB = 'bbbb009876543210';

    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, spanId: spanA, payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:01.000Z', runId: RUN_ID, spanId: spanA, payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:02.000Z', runId: RUN_ID, spanId: spanB, payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:03.000Z', runId: RUN_ID, spanId: spanB, payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    const lines = output.split('\n');

    expect(lines).toHaveLength(4);

    const spanALines = lines.filter((l) => l.includes('[span:aaaa00]'));
    const spanBLines = lines.filter((l) => l.includes('[span:bbbb00]'));

    expect(spanALines).toHaveLength(2);
    expect(spanBLines).toHaveLength(2);

    // Last event of span A uses └─
    const spanAIdx = lines.findIndex((l) => l.includes('[span:aaaa00]'));
    expect(lines[spanAIdx]).toContain('├─');
    expect(lines[spanAIdx + 1]).toContain('└─');
  });
});

// ---------------------------------------------------------------------------
// 5. Root and span events are interleaved chronologically
// ---------------------------------------------------------------------------

describe('formatTrace pretty — root and span events interleaved chronologically', () => {
  it('root event with earlier ts appears before span group', async () => {
    const spanId = 'cccc001234567890';

    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, eventType: 'run_start', payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:01.000Z', runId: RUN_ID, spanId, eventType: 'tool_call', payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    const lines = output.split('\n');

    // root event first
    expect(lines[0]).toContain('run_start');
    expect(lines[0]).not.toContain('[span:');

    // span event second
    expect(lines[1]).toContain('[span:cccc00]');
  });

  it('span group with earlier ts appears before root event', async () => {
    const spanId = 'dddd001234567890';

    const events: TraceEvent[] = [
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, spanId, eventType: 'tool_call', payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:05.000Z', runId: RUN_ID, eventType: 'run_end', payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    const lines = output.split('\n');

    expect(lines[0]).toContain('[span:dddd00]');
    expect(lines[1]).toContain('run_end');
  });

  it('mixed root and multiple span groups maintain timestamp order', async () => {
    const spanA = 'eeee001234567890';
    const spanB = 'ffff001234567890';

    const events: TraceEvent[] = [
      // Root first
      makeEvent({ ts: '2024-01-01T10:00:00.000Z', runId: RUN_ID, eventType: 'run_start', payload: {} }),
      // span A starts at 10:00:01
      makeEvent({ ts: '2024-01-01T10:00:01.000Z', runId: RUN_ID, spanId: spanA, payload: {} }),
      makeEvent({ ts: '2024-01-01T10:00:02.000Z', runId: RUN_ID, spanId: spanA, payload: {} }),
      // span B starts at 10:00:03
      makeEvent({ ts: '2024-01-01T10:00:03.000Z', runId: RUN_ID, spanId: spanB, payload: {} }),
      // Root end at 10:00:10
      makeEvent({ ts: '2024-01-01T10:00:10.000Z', runId: RUN_ID, eventType: 'run_end', payload: {} }),
    ];

    const output = await formatTrace(events, 'pretty');
    const lines = output.split('\n');

    expect(lines[0]).toContain('run_start');
    expect(lines[1]).toContain('[span:eeee00]');
    expect(lines[2]).toContain('[span:eeee00]');
    expect(lines[3]).toContain('[span:ffff00]');
    expect(lines[4]).toContain('run_end');
  });
});
