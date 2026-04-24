/**
 * Integration tests for GET /api/runs/[runId]/phases (MOB-1075)
 *
 * Test cases:
 *  1. Run not found (readRunEvents returns []) → 404 { error: 'Run not found' }
 *  2. Happy path — 200 with correct response shape:
 *       { run_start, run_end, phases: [{ id, name, status, started_at, finished_at, gate_decision }] }
 *  3. Phase with finishedAt → status 'finished'
 *  4. Phase without finishedAt → status 'running'
 *  5. gate_decision is set correctly for pass/warn/fail/null
 *  6. phase id is composed as `${runId}__${phaseName}`
 *  7. Multiple phases returned correctly
 *  8. readRunEvents throws → 500 { error: 'Internal server error' }
 *
 * Run:
 *   npx vitest run --pool=threads "apps/ui/app/api/runs/[runId]/phases/__tests__/route.test.ts" --reporter=verbose
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/server
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  },
}));

// ---------------------------------------------------------------------------
// Mock jsonl-reader — all functions used by the route
// ---------------------------------------------------------------------------

const mockReadRunEvents = vi.fn();
const mockBuildPhasesFromEvents = vi.fn();
const mockBuildRunFromEvents = vi.fn();

vi.mock('@/lib/jsonl-reader', () => ({
  readRunEvents: (...args: unknown[]) => mockReadRunEvents(...args),
  buildPhasesFromEvents: (...args: unknown[]) => mockBuildPhasesFromEvents(...args),
  buildRunFromEvents: (...args: unknown[]) => mockBuildRunFromEvents(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeRequest(): Request {
  return new Request(`http://localhost/api/runs/${RUN_ID}/phases`);
}

async function callRoute(runId = RUN_ID) {
  const { GET } = await import('../route');
  const res = await GET(makeRequest(), { params: { runId } } as { params: { runId: string } });
  const json = await res.json();
  return { status: res.status, json };
}

const SAMPLE_RUN = {
  id: RUN_ID,
  issueId: 'MOB-1075',
  status: 'done',
  startedAt: '2025-01-01T10:00:00.000Z',
  finishedAt: '2025-01-01T10:30:00.000Z',
  totalTokens: 1000,
  totalCostUsd: '0.001234',
  gateFinal: 'pass' as const,
};

const SAMPLE_PHASE_FINISHED = {
  phase: 'develop',
  startedAt: '2025-01-01T10:00:00.000Z',
  finishedAt: '2025-01-01T10:10:00.000Z',
  tokensIn: 500,
  tokensOut: 300,
  costUsd: '0.000500',
  gate: 'pass' as const,
};

const SAMPLE_PHASE_RUNNING = {
  phase: 'test',
  startedAt: '2025-01-01T10:10:00.000Z',
  finishedAt: null,
  tokensIn: 200,
  tokensOut: 100,
  costUsd: '0.000200',
  gate: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/runs/[runId]/phases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: run found with one finished phase
    mockReadRunEvents.mockResolvedValue([{ eventType: 'run_start', ts: '2025-01-01T10:00:00Z', runId: RUN_ID, payload: {} }]);
    mockBuildRunFromEvents.mockReturnValue(SAMPLE_RUN);
    mockBuildPhasesFromEvents.mockReturnValue([SAMPLE_PHASE_FINISHED]);
  });

  // ── 1. Run not found ───────────────────────────────────────────────────────

  it('returns 404 when readRunEvents returns empty array (run not found)', async () => {
    mockReadRunEvents.mockResolvedValueOnce([]);

    const { status, json } = await callRoute();

    expect(status).toBe(404);
    expect(json).toEqual({ error: 'Run not found' });
    expect(mockBuildRunFromEvents).not.toHaveBeenCalled();
    expect(mockBuildPhasesFromEvents).not.toHaveBeenCalled();
  });

  // ── 2. Happy path — response shape ────────────────────────────────────────

  it('returns 200 with correct top-level shape (run_start, run_end, phases array)', async () => {
    const { status, json } = await callRoute();

    expect(status).toBe(200);
    expect(json).toHaveProperty('run_start');
    expect(json).toHaveProperty('run_end');
    expect(json).toHaveProperty('phases');
    expect(Array.isArray(json.phases)).toBe(true);
  });

  it('returns run_start from run.startedAt', async () => {
    const { json } = await callRoute();
    expect(json.run_start).toBe(SAMPLE_RUN.startedAt);
  });

  it('returns run_end from run.finishedAt', async () => {
    const { json } = await callRoute();
    expect(json.run_end).toBe(SAMPLE_RUN.finishedAt);
  });

  it('returns run_end as null when run is still in progress', async () => {
    mockBuildRunFromEvents.mockReturnValueOnce({ ...SAMPLE_RUN, finishedAt: null });

    const { json } = await callRoute();

    expect(json.run_end).toBeNull();
  });

  // ── 3. Phase shape — finished phase ───────────────────────────────────────

  it('returns correct shape for a finished phase (id, name, status, started_at, finished_at, gate_decision)', async () => {
    const { json } = await callRoute();

    expect(json.phases).toHaveLength(1);
    const phase = json.phases[0];
    expect(phase).toHaveProperty('id');
    expect(phase).toHaveProperty('name');
    expect(phase).toHaveProperty('status');
    expect(phase).toHaveProperty('started_at');
    expect(phase).toHaveProperty('finished_at');
    expect(phase).toHaveProperty('gate_decision');
  });

  it('sets status to "finished" when phase has finishedAt', async () => {
    const { json } = await callRoute();
    expect(json.phases[0].status).toBe('finished');
  });

  it('sets started_at and finished_at from phase timestamps', async () => {
    const { json } = await callRoute();
    const phase = json.phases[0];
    expect(phase.started_at).toBe(SAMPLE_PHASE_FINISHED.startedAt);
    expect(phase.finished_at).toBe(SAMPLE_PHASE_FINISHED.finishedAt);
  });

  it('sets gate_decision to "pass" for a pass gate', async () => {
    const { json } = await callRoute();
    expect(json.phases[0].gate_decision).toBe('pass');
  });

  // ── 4. Phase shape — running phase ────────────────────────────────────────

  it('sets status to "running" when phase has no finishedAt', async () => {
    mockBuildPhasesFromEvents.mockReturnValueOnce([SAMPLE_PHASE_RUNNING]);

    const { json } = await callRoute();

    expect(json.phases[0].status).toBe('running');
  });

  it('sets finished_at to null for a running phase', async () => {
    mockBuildPhasesFromEvents.mockReturnValueOnce([SAMPLE_PHASE_RUNNING]);

    const { json } = await callRoute();

    expect(json.phases[0].finished_at).toBeNull();
  });

  // ── 5. gate_decision values ────────────────────────────────────────────────

  it('sets gate_decision to "warn" for a warn gate', async () => {
    mockBuildPhasesFromEvents.mockReturnValueOnce([
      { ...SAMPLE_PHASE_FINISHED, gate: 'warn' },
    ]);

    const { json } = await callRoute();

    expect(json.phases[0].gate_decision).toBe('warn');
  });

  it('sets gate_decision to "fail" for a fail gate', async () => {
    mockBuildPhasesFromEvents.mockReturnValueOnce([
      { ...SAMPLE_PHASE_FINISHED, gate: 'fail' },
    ]);

    const { json } = await callRoute();

    expect(json.phases[0].gate_decision).toBe('fail');
  });

  it('sets gate_decision to null when phase has no gate', async () => {
    mockBuildPhasesFromEvents.mockReturnValueOnce([SAMPLE_PHASE_RUNNING]);

    const { json } = await callRoute();

    expect(json.phases[0].gate_decision).toBeNull();
  });

  // ── 6. Phase id composition ────────────────────────────────────────────────

  it('composes phase id as `${runId}__${phaseName}`', async () => {
    const { json } = await callRoute();
    expect(json.phases[0].id).toBe(`${RUN_ID}__develop`);
  });

  it('sets phase name from the phase.phase field', async () => {
    const { json } = await callRoute();
    expect(json.phases[0].name).toBe('develop');
  });

  // ── 7. Multiple phases ─────────────────────────────────────────────────────

  it('returns all phases when multiple are present', async () => {
    mockBuildPhasesFromEvents.mockReturnValueOnce([
      SAMPLE_PHASE_FINISHED,
      SAMPLE_PHASE_RUNNING,
    ]);

    const { json } = await callRoute();

    expect(json.phases).toHaveLength(2);
    expect(json.phases[0].name).toBe('develop');
    expect(json.phases[1].name).toBe('test');
  });

  it('returns empty phases array when buildPhasesFromEvents returns []', async () => {
    mockBuildPhasesFromEvents.mockReturnValueOnce([]);

    const { json } = await callRoute();

    expect(json.phases).toEqual([]);
    expect(json).toHaveProperty('run_start');
  });

  // ── 8. Error handling ─────────────────────────────────────────────────────

  it('returns 500 when readRunEvents throws an unexpected error', async () => {
    mockReadRunEvents.mockRejectedValueOnce(new Error('filesystem error'));

    const { status, json } = await callRoute();

    expect(status).toBe(500);
    expect(json).toHaveProperty('error');
    expect(json.error).toBe('Internal server error');
  });

  it('returns 500 when buildRunFromEvents throws', async () => {
    mockBuildRunFromEvents.mockImplementationOnce(() => {
      throw new Error('parsing failure');
    });

    const { status, json } = await callRoute();

    expect(status).toBe(500);
    expect(json).toHaveProperty('error');
  });

  it('does not leak internal error details in 500 response', async () => {
    mockReadRunEvents.mockRejectedValueOnce(new Error('secret DB password in error'));

    const { json } = await callRoute();

    // Must not contain the internal error message
    expect(JSON.stringify(json)).not.toContain('secret DB password');
  });
});
