/**
 * Unit tests for apps/ui/lib/jsonl-reader.ts
 *
 * Covers:
 * - buildRunFromEvents(): happy path, in-progress status, missing events, gate logic, cost accumulation
 * - buildPhasesFromEvents(): phase ordering, multiple phases, gate per phase, cost per phase, missing timestamps
 */

import { describe, it, expect } from 'vitest';
import {
  buildRunFromEvents,
  buildPhasesFromEvents,
  type TraceEventRaw,
} from '../../apps/ui/lib/jsonl-reader.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_ID = 'run-abc-123';
const TS1 = '2024-01-01T00:00:00.000Z';
const TS2 = '2024-01-01T00:01:00.000Z';
const TS3 = '2024-01-01T00:02:00.000Z';

function makeEvent(
  eventType: TraceEventRaw['eventType'],
  payload: Record<string, unknown> = {},
  overrides: Partial<TraceEventRaw> = {},
): TraceEventRaw {
  return {
    ts: TS1,
    runId: RUN_ID,
    eventType,
    payload,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildRunFromEvents — happy path
// ---------------------------------------------------------------------------

describe('buildRunFromEvents — happy path', () => {
  it('returns a Run with correct id', () => {
    const run = buildRunFromEvents(RUN_ID, []);
    expect(run.id).toBe(RUN_ID);
  });

  it('extracts issueId from run_start payload', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_start', { issueId: 'MOB-1023' }, { ts: TS1 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.issueId).toBe('MOB-1023');
  });

  it('sets startedAt from run_start ts', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_start', {}, { ts: TS1 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.startedAt).toBe(TS1);
  });

  it('sets finishedAt from run_end ts', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_start', {}, { ts: TS1 }),
      makeEvent('run_end', { status: 'done' }, { ts: TS2 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.finishedAt).toBe(TS2);
  });

  it('sets status from run_end payload', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_end', { status: 'failed' }, { ts: TS2 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.status).toBe('failed');
  });

  it('defaults status to "done" when run_end has no status payload', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_end', {}, { ts: TS2 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// buildRunFromEvents — in-progress (no run_end)
// ---------------------------------------------------------------------------

describe('buildRunFromEvents — in-progress run', () => {
  it('sets status to "in_progress" when there is no run_end event', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_start', { issueId: 'MOB-1' }, { ts: TS1 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.status).toBe('in_progress');
    expect(run.finishedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRunFromEvents — empty events
// ---------------------------------------------------------------------------

describe('buildRunFromEvents — empty events', () => {
  it('returns a run with default fallback values when events is empty', () => {
    const run = buildRunFromEvents(RUN_ID, []);
    expect(run.id).toBe(RUN_ID);
    expect(run.issueId).toBe('');
    expect(run.status).toBe('in_progress');
    expect(run.finishedAt).toBeNull();
    expect(run.totalTokens).toBe(0);
    expect(run.totalCostUsd).toBe('0.000000');
    expect(run.gateFinal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRunFromEvents — cost accumulation
// ---------------------------------------------------------------------------

describe('buildRunFromEvents — cost accumulation', () => {
  it('sums totalTokens from all cost events', () => {
    const events: TraceEventRaw[] = [
      makeEvent('cost', { tokensIn: 100, tokensOut: 50, costUsd: 0.001 }),
      makeEvent('cost', { tokensIn: 200, tokensOut: 100, costUsd: 0.002 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.totalTokens).toBe(450); // 100+50 + 200+100
  });

  it('sums totalCostUsd from all cost events and formats to 6 decimal places', () => {
    const events: TraceEventRaw[] = [
      makeEvent('cost', { tokensIn: 0, tokensOut: 0, costUsd: 0.000123 }),
      makeEvent('cost', { tokensIn: 0, tokensOut: 0, costUsd: 0.000456 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.totalCostUsd).toBe('0.000579');
  });

  it('ignores NaN costUsd values gracefully', () => {
    const events: TraceEventRaw[] = [
      makeEvent('cost', { tokensIn: 100, tokensOut: 0, costUsd: 'not-a-number' }),
      makeEvent('cost', { tokensIn: 50, tokensOut: 0, costUsd: 0.001 }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.totalTokens).toBe(150);
    expect(run.totalCostUsd).toBe('0.001000');
  });

  it('returns zero cost and tokens when there are no cost events', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_start', { issueId: 'MOB-1' }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.totalTokens).toBe(0);
    expect(run.totalCostUsd).toBe('0.000000');
  });
});

// ---------------------------------------------------------------------------
// buildRunFromEvents — gate logic
// ---------------------------------------------------------------------------

describe('buildRunFromEvents — gate logic', () => {
  it('uses the last gate event decision as gateFinal', () => {
    const events: TraceEventRaw[] = [
      makeEvent('gate', { decision: 'pass', phase: 'develop' }),
      makeEvent('gate', { decision: 'warn', phase: 'security' }),
      makeEvent('gate', { decision: 'fail', phase: 'review' }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.gateFinal).toBe('fail');
  });

  it('sets gateFinal to "pass" when all gate events are pass', () => {
    const events: TraceEventRaw[] = [
      makeEvent('gate', { decision: 'pass', phase: 'develop' }),
      makeEvent('gate', { decision: 'pass', phase: 'test' }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.gateFinal).toBe('pass');
  });

  it('sets gateFinal to null when there are no gate events', () => {
    const events: TraceEventRaw[] = [
      makeEvent('run_start', { issueId: 'MOB-1' }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.gateFinal).toBeNull();
  });

  it('accepts "warn" as a valid gateFinal value', () => {
    const events: TraceEventRaw[] = [
      makeEvent('gate', { decision: 'warn', phase: 'perf' }),
    ];
    const run = buildRunFromEvents(RUN_ID, events);
    expect(run.gateFinal).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// buildPhasesFromEvents — basic ordering
// ---------------------------------------------------------------------------

describe('buildPhasesFromEvents — phase ordering', () => {
  it('returns phases in order of first appearance', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
      makeEvent('phase_start', { phase: 'test' }, { ts: TS2 }),
      makeEvent('phase_start', { phase: 'review' }, { ts: TS3 }),
    ];
    const phases = buildPhasesFromEvents(events);
    expect(phases.map((p) => p.phase)).toEqual(['develop', 'test', 'review']);
  });

  it('returns empty array when there are no phase-related events', () => {
    const phases = buildPhasesFromEvents([]);
    expect(phases).toEqual([]);
  });

  it('returns a single phase from a single phase_start event', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
    ];
    const phases = buildPhasesFromEvents(events);
    expect(phases).toHaveLength(1);
    expect(phases[0].phase).toBe('develop');
  });
});

// ---------------------------------------------------------------------------
// buildPhasesFromEvents — timestamps
// ---------------------------------------------------------------------------

describe('buildPhasesFromEvents — timestamps', () => {
  it('sets startedAt from phase_start ts', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.startedAt).toBe(TS1);
  });

  it('sets finishedAt from phase_end ts', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
      makeEvent('phase_end', { phase: 'develop' }, { ts: TS2 }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.finishedAt).toBe(TS2);
  });

  it('sets finishedAt to null when there is no phase_end event', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.finishedAt).toBeNull();
  });

  it('uses epoch fallback for startedAt when phase_start is absent', () => {
    // Phase appears first via a cost event, no phase_start
    const events: TraceEventRaw[] = [
      makeEvent('cost', { phase: 'orphan', tokensIn: 10, tokensOut: 5, costUsd: 0.001 }, { ts: TS2 }),
    ];
    const phases = buildPhasesFromEvents(events);
    expect(phases[0].startedAt).toBe(new Date(0).toISOString());
  });
});

// ---------------------------------------------------------------------------
// buildPhasesFromEvents — token and cost accumulation per phase
// ---------------------------------------------------------------------------

describe('buildPhasesFromEvents — cost per phase', () => {
  it('accumulates tokensIn and tokensOut per phase from cost events', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
      makeEvent('cost', { phase: 'develop', tokensIn: 100, tokensOut: 50, costUsd: 0.001 }),
      makeEvent('cost', { phase: 'develop', tokensIn: 200, tokensOut: 100, costUsd: 0.002 }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.tokensIn).toBe(300);
    expect(phase.tokensOut).toBe(150);
  });

  it('formats costUsd to 6 decimal places per phase', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'test' }, { ts: TS1 }),
      makeEvent('cost', { phase: 'test', tokensIn: 0, tokensOut: 0, costUsd: 0.000123 }),
      makeEvent('cost', { phase: 'test', tokensIn: 0, tokensOut: 0, costUsd: 0.000456 }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.costUsd).toBe('0.000579');
  });

  it('separates costs between distinct phases', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
      makeEvent('cost', { phase: 'develop', tokensIn: 100, tokensOut: 0, costUsd: 0.001 }),
      makeEvent('phase_start', { phase: 'test' }, { ts: TS2 }),
      makeEvent('cost', { phase: 'test', tokensIn: 200, tokensOut: 0, costUsd: 0.002 }),
    ];
    const phases = buildPhasesFromEvents(events);
    const develop = phases.find((p) => p.phase === 'develop')!;
    const test = phases.find((p) => p.phase === 'test')!;
    expect(develop.tokensIn).toBe(100);
    expect(test.tokensIn).toBe(200);
    expect(develop.costUsd).toBe('0.001000');
    expect(test.costUsd).toBe('0.002000');
  });

  it('returns zero cost for phases with no cost events', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.tokensIn).toBe(0);
    expect(phase.tokensOut).toBe(0);
    expect(phase.costUsd).toBe('0.000000');
  });
});

// ---------------------------------------------------------------------------
// buildPhasesFromEvents — gate per phase
// ---------------------------------------------------------------------------

describe('buildPhasesFromEvents — gate per phase', () => {
  it('sets gate from gate event for the matching phase', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'security' }, { ts: TS1 }),
      makeEvent('gate', { phase: 'security', decision: 'fail' }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.gate).toBe('fail');
  });

  it('leaves gate as null when there is no gate event for the phase', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'develop' }, { ts: TS1 }),
    ];
    const [phase] = buildPhasesFromEvents(events);
    expect(phase.gate).toBeNull();
  });

  it('assigns gates to the correct phase independently', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', { phase: 'perf' }, { ts: TS1 }),
      makeEvent('phase_start', { phase: 'security' }, { ts: TS2 }),
      makeEvent('gate', { phase: 'perf', decision: 'pass' }),
      makeEvent('gate', { phase: 'security', decision: 'warn' }),
    ];
    const phases = buildPhasesFromEvents(events);
    const perf = phases.find((p) => p.phase === 'perf')!;
    const security = phases.find((p) => p.phase === 'security')!;
    expect(perf.gate).toBe('pass');
    expect(security.gate).toBe('warn');
  });
});

// ---------------------------------------------------------------------------
// buildPhasesFromEvents — phaseId fallback
// ---------------------------------------------------------------------------

describe('buildPhasesFromEvents — phaseId fallback', () => {
  it('uses event.phaseId when payload.phase is absent in phase_start', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', {}, { ts: TS1, phaseId: 'uuid-phase-develop' }),
    ];
    const phases = buildPhasesFromEvents(events);
    expect(phases[0].phase).toBe('uuid-phase-develop');
  });

  it('falls back to "unknown" when both payload.phase and phaseId are absent', () => {
    const events: TraceEventRaw[] = [
      makeEvent('phase_start', {}, { ts: TS1 }),
    ];
    const phases = buildPhasesFromEvents(events);
    expect(phases[0].phase).toBe('unknown');
  });
});
