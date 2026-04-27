import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TraceEvent } from '../../schemas/trace.js';
import { CURRENT_SCHEMA_VERSION } from '../../schemas/versioning.js';

// ---------------------------------------------------------------------------
// Mock the trace reader before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../trace/reader.js', () => ({
  readTrace: vi.fn(),
}));

import { readTrace } from '../../trace/reader.js';
import { detectCommandDrift } from '../drift-detector.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RUN_ID_1 = '00000000-0000-0000-0000-000000000001';
const RUN_ID_2 = '00000000-0000-0000-0000-000000000002';
const NOW = '2024-06-01T10:00:00.000Z';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhaseStartEvent(
  runId: string,
  phase: string,
  fingerprint: string,
): TraceEvent {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ts: NOW,
    runId,
    eventType: 'phase_start',
    commandFingerprint: fingerprint,
    payload: { phase },
  };
}

function makeOtherEvent(runId: string): TraceEvent {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    ts: NOW,
    runId,
    eventType: 'run_start',
    payload: {},
  };
}

// ---------------------------------------------------------------------------
// detectCommandDrift
// ---------------------------------------------------------------------------

describe('detectCommandDrift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the correct runId1 and runId2 in the report', async () => {
    vi.mocked(readTrace).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    expect(report.runId1).toBe(RUN_ID_1);
    expect(report.runId2).toBe(RUN_ID_2);
  });

  it('marks a phase as drifted when the fingerprints differ between runs', async () => {
    vi.mocked(readTrace)
      .mockResolvedValueOnce([makePhaseStartEvent(RUN_ID_1, 'dev', 'aabbccdd11223344')])
      .mockResolvedValueOnce([makePhaseStartEvent(RUN_ID_2, 'dev', 'ffffffff99999999')]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    expect(report.drifted).toHaveLength(1);
    expect(report.drifted[0]).toEqual({
      phase: 'dev',
      fingerprint1: 'aabbccdd11223344',
      fingerprint2: 'ffffffff99999999',
    });
    expect(report.unchanged).toHaveLength(0);
  });

  it('marks a phase as unchanged when the fingerprints are equal', async () => {
    const fp = 'aabbccdd11223344';
    vi.mocked(readTrace)
      .mockResolvedValueOnce([makePhaseStartEvent(RUN_ID_1, 'test', fp)])
      .mockResolvedValueOnce([makePhaseStartEvent(RUN_ID_2, 'test', fp)]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    expect(report.unchanged).toContain('test');
    expect(report.drifted).toHaveLength(0);
  });

  it('handles multiple phases — correctly splits drifted vs unchanged', async () => {
    const stableFp = 'stable-fp-0000000';
    vi.mocked(readTrace)
      .mockResolvedValueOnce([
        makePhaseStartEvent(RUN_ID_1, 'dev', 'fp-dev-run1-0000'),
        makePhaseStartEvent(RUN_ID_1, 'test', stableFp),
        makePhaseStartEvent(RUN_ID_1, 'security', 'fp-sec-run1-0000'),
      ])
      .mockResolvedValueOnce([
        makePhaseStartEvent(RUN_ID_2, 'dev', 'fp-dev-run2-9999'),
        makePhaseStartEvent(RUN_ID_2, 'test', stableFp),
        makePhaseStartEvent(RUN_ID_2, 'security', 'fp-sec-run2-9999'),
      ]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    const driftedPhases = report.drifted.map((d) => d.phase);
    expect(driftedPhases).toContain('dev');
    expect(driftedPhases).toContain('security');
    expect(report.unchanged).toContain('test');
    expect(report.unchanged).not.toContain('dev');
    expect(report.unchanged).not.toContain('security');
  });

  it('returns empty drifted and unchanged when both runs have no phase_start events', async () => {
    vi.mocked(readTrace)
      .mockResolvedValueOnce([makeOtherEvent(RUN_ID_1)])
      .mockResolvedValueOnce([makeOtherEvent(RUN_ID_2)]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    expect(report.drifted).toHaveLength(0);
    expect(report.unchanged).toHaveLength(0);
  });

  it('ignores phase_start events that have no commandFingerprint', async () => {
    const eventWithoutFp: TraceEvent = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ts: NOW,
      runId: RUN_ID_1,
      eventType: 'phase_start',
      payload: { phase: 'dev' },
    };
    vi.mocked(readTrace)
      .mockResolvedValueOnce([eventWithoutFp])
      .mockResolvedValueOnce([makePhaseStartEvent(RUN_ID_2, 'dev', 'aabbccdd11223344')]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    // phase only present in one map — neither drifted nor unchanged
    expect(report.drifted).toHaveLength(0);
    expect(report.unchanged).toHaveLength(0);
  });

  it('ignores phase_start events that have a non-string phase in payload', async () => {
    const badPhaseEvent: TraceEvent = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ts: NOW,
      runId: RUN_ID_1,
      eventType: 'phase_start',
      commandFingerprint: 'aabbccdd11223344',
      payload: { phase: 42 as unknown as string },
    };
    vi.mocked(readTrace)
      .mockResolvedValueOnce([badPhaseEvent])
      .mockResolvedValueOnce([makePhaseStartEvent(RUN_ID_2, 'dev', 'aabbccdd11223344')]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    expect(report.drifted).toHaveLength(0);
    expect(report.unchanged).toHaveLength(0);
  });

  it('ignores non-phase_start events when building fingerprint maps', async () => {
    const toolCallEvent: TraceEvent = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ts: NOW,
      runId: RUN_ID_1,
      eventType: 'tool_call',
      commandFingerprint: 'should-be-ignored',
      payload: { phase: 'dev' },
    };
    vi.mocked(readTrace)
      .mockResolvedValueOnce([toolCallEvent])
      .mockResolvedValueOnce([makePhaseStartEvent(RUN_ID_2, 'dev', 'aabbccdd11223344')]);

    const report = await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    expect(report.drifted).toHaveLength(0);
    expect(report.unchanged).toHaveLength(0);
  });

  it('calls readTrace with both runIds', async () => {
    vi.mocked(readTrace).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await detectCommandDrift(RUN_ID_1, RUN_ID_2);

    expect(readTrace).toHaveBeenCalledTimes(2);
    expect(readTrace).toHaveBeenCalledWith(RUN_ID_1);
    expect(readTrace).toHaveBeenCalledWith(RUN_ID_2);
  });
});
