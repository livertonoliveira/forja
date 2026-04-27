/**
 * Unit tests for `handleStop` in src/hooks/stop.ts — MOB-1010.
 *
 * Tests the timeout enforcement path and normal behaviour.
 * All external dependencies (store, FSM, TraceWriter) are fully mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_RUN_ID = randomUUID();
const VALID_PHASE_ID = randomUUID();

// ---------------------------------------------------------------------------
// Mocks — vi.mock is hoisted, so factories must be self-contained.
// Spy handles are wired up in the top-level beforeEach via vi.mocked().
// ---------------------------------------------------------------------------

vi.mock('../../store/factory.js', () => ({
  createStoreFromConfig: vi.fn(),
}));

vi.mock('../../engine/fsm.js', () => ({
  PipelineFSM: vi.fn(),
}));

vi.mock('../../trace/writer.js', () => ({
  TraceWriter: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import { handleStop } from '../stop.js';
import { createStoreFromConfig } from '../../store/factory.js';
import { PipelineFSM } from '../../engine/fsm.js';
import { TraceWriter } from '../../trace/writer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearEnv(): void {
  delete process.env.FORJA_RUN_ID;
  delete process.env.FORJA_PHASE;
  delete process.env.FORJA_PHASE_ID;
  delete process.env.FORJA_SPAN_ID;
  delete process.env.FORJA_PHASE_TIMEOUT_AT;
}

// ---------------------------------------------------------------------------
// Top-level setup: wire mock instances before each test
// ---------------------------------------------------------------------------

let mockUpdatePhase: ReturnType<typeof vi.fn>;
let mockClose: ReturnType<typeof vi.fn>;
let mockTransition: ReturnType<typeof vi.fn>;
let mockWrite: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUpdatePhase = vi.fn().mockResolvedValue({});
  mockClose = vi.fn().mockResolvedValue(undefined);
  mockTransition = vi.fn().mockResolvedValue(undefined);
  mockWrite = vi.fn().mockResolvedValue(undefined);

  vi.mocked(createStoreFromConfig).mockResolvedValue({
    updatePhase: mockUpdatePhase,
    close: mockClose,
  } as unknown as Awaited<ReturnType<typeof createStoreFromConfig>>);

  vi.mocked(PipelineFSM).mockImplementation(
    function() { return { transition: mockTransition } as unknown as InstanceType<typeof PipelineFSM>; },
  );

  vi.mocked(TraceWriter).mockImplementation(
    function() { return { write: mockWrite } as unknown as InstanceType<typeof TraceWriter>; },
  );
});

afterEach(() => {
  clearEnv();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('handleStop — FORJA_RUN_ID missing: returns early', () => {
  it('returns without calling store or TraceWriter when FORJA_RUN_ID is absent', async () => {
    // Env already cleared by afterEach on previous test, clearEnv() not needed here
    await handleStop({});

    expect(mockUpdatePhase).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns without calling store when FORJA_RUN_ID is not a valid UUID', async () => {
    setEnv({ FORJA_RUN_ID: 'not-a-uuid' });

    await handleStop({});

    expect(mockUpdatePhase).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe('handleStop — timed out + phaseId present: updates phase and transitions FSM', () => {
  beforeEach(() => {
    setEnv({
      FORJA_RUN_ID: VALID_RUN_ID,
      FORJA_PHASE: 'dev',
      FORJA_PHASE_ID: VALID_PHASE_ID,
      // Set deadline in the past so isTimedOut() returns true
      FORJA_PHASE_TIMEOUT_AT: new Date(Date.now() - 5_000).toISOString(),
    });
  });

  it('calls store.updatePhase with status="timeout" and a finishedAt timestamp', async () => {
    await handleStop({});

    expect(mockUpdatePhase).toHaveBeenCalledOnce();
    const [id, data] = mockUpdatePhase.mock.calls[0];
    expect(id).toBe(VALID_PHASE_ID);
    expect(data.status).toBe('timeout');
    expect(typeof data.finishedAt).toBe('string');
    expect(new Date(data.finishedAt).getTime()).not.toBeNaN();
  });

  it('transitions FSM to "failed"', async () => {
    await handleStop({});

    expect(mockTransition).toHaveBeenCalledOnce();
    expect(mockTransition).toHaveBeenCalledWith('failed');
  });

  it('closes the store after updating phase', async () => {
    await handleStop({});

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('writes a trace event with timedOut:true and status="interrupted"', async () => {
    await handleStop({});

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.timedOut).toBe(true);
    expect(event.payload.status).toBe('interrupted');
    expect(event.payload.phase).toBe('dev');
  });
});

describe('handleStop — not timed out: normal completed path', () => {
  beforeEach(() => {
    setEnv({
      FORJA_RUN_ID: VALID_RUN_ID,
      FORJA_PHASE: 'test',
      FORJA_PHASE_ID: VALID_PHASE_ID,
      // No FORJA_PHASE_TIMEOUT_AT — isTimedOut() returns false
    });
  });

  it('does not call store.updatePhase when not timed out', async () => {
    await handleStop({ stop_reason: 'end_turn' });

    expect(mockUpdatePhase).not.toHaveBeenCalled();
  });

  it('does not transition FSM when not timed out', async () => {
    await handleStop({ stop_reason: 'end_turn' });

    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('writes a trace event with status="completed" when stop_reason is end_turn', async () => {
    await handleStop({ stop_reason: 'end_turn' });

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.status).toBe('completed');
    expect(event.payload.timedOut).toBeUndefined();
  });

  it('writes a trace event with status="interrupted" when stop_reason is interrupted', async () => {
    await handleStop({ stop_reason: 'interrupted' });

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.status).toBe('interrupted');
    expect(event.payload.stopReason).toBe('interrupted');
  });
});

describe('handleStop — timed out but phaseId missing: skips store update', () => {
  beforeEach(() => {
    setEnv({
      FORJA_RUN_ID: VALID_RUN_ID,
      FORJA_PHASE: 'dev',
      // No FORJA_PHASE_ID
      FORJA_PHASE_TIMEOUT_AT: new Date(Date.now() - 5_000).toISOString(),
    });
  });

  it('does not call store.updatePhase when phaseId is absent', async () => {
    await handleStop({});

    expect(mockUpdatePhase).not.toHaveBeenCalled();
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('still writes a trace event with timedOut:true', async () => {
    await handleStop({});

    expect(mockWrite).toHaveBeenCalledOnce();
    const [event] = mockWrite.mock.calls[0];
    expect(event.payload.timedOut).toBe(true);
  });
});
