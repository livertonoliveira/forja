/**
 * Integration tests for apps/ui/app/api/* route handlers.
 *
 * Strategy: mock the `apps/ui/lib/jsonl-reader` module and mock `next/server`
 * so route handlers can be imported and invoked directly without a running
 * Next.js server.
 *
 * Covers:
 * - GET /api/runs        → list of runs, sorted by startedAt desc
 * - GET /api/runs/:runId → run + phases; 404 when not found
 * - GET /api/issues/:issueId → filtered runs for the issue
 * - GET /api/cost        → CostSummary with totals and breakdowns
 * - GET /api/findings    → grouped findings; optional runId filter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal NextResponse mock that mimics the real API surface
// ---------------------------------------------------------------------------

class MockNextResponse {
  readonly status: number;
  private readonly body: unknown;

  constructor(body: unknown, init?: { status?: number }) {
    this.body = body;
    this.status = init?.status ?? 200;
  }

  async json(): Promise<unknown> {
    return this.body;
  }

  static json(body: unknown, init?: { status?: number }): MockNextResponse {
    return new MockNextResponse(body, init);
  }
}

// ---------------------------------------------------------------------------
// Mock next/server BEFORE importing any route handler
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: MockNextResponse,
  NextRequest: class MockNextRequest {
    readonly url: string;
    constructor(url: string) {
      this.url = url;
    }
  },
}));

// ---------------------------------------------------------------------------
// Mock @/lib/jsonl-reader (alias used by Next.js routes)
// ---------------------------------------------------------------------------

vi.mock('@/lib/jsonl-reader', () => ({
  listRunIds: vi.fn(),
  readRunEvents: vi.fn(),
  readRunEventsAll: vi.fn(),
  buildRunFromEvents: vi.fn(),
  buildPhasesFromEvents: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import mocked module so we can control return values
// The `@` alias resolves to `apps/ui` via vitest.config.ts, matching what
// the route handlers import as `@/lib/jsonl-reader`.
// ---------------------------------------------------------------------------

import * as jsonlReader from '@/lib/jsonl-reader';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<{
  id: string;
  issueId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  totalTokens: number;
  totalCostUsd: string;
  gateFinal: 'pass' | 'warn' | 'fail' | null;
}> = {}) {
  return {
    id: 'run-1',
    issueId: 'MOB-1023',
    status: 'done',
    startedAt: '2024-01-01T00:00:00.000Z',
    finishedAt: '2024-01-01T01:00:00.000Z',
    totalTokens: 1000,
    totalCostUsd: '0.001000',
    gateFinal: 'pass' as const,
    ...overrides,
  };
}

function makePhase(overrides: Partial<{
  phase: string;
  startedAt: string;
  finishedAt: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: string;
  gate: 'pass' | 'warn' | 'fail' | null;
}> = {}) {
  return {
    phase: 'develop',
    startedAt: '2024-01-01T00:00:00.000Z',
    finishedAt: '2024-01-01T00:30:00.000Z',
    tokensIn: 500,
    tokensOut: 200,
    costUsd: '0.000500',
    gate: 'pass' as const,
    ...overrides,
  };
}

function makeFindingEvent(overrides: Partial<{
  eventType: 'finding';
  ts: string;
  runId: string;
  phaseId: string;
  payload: Record<string, unknown>;
}> = {}) {
  return {
    eventType: 'finding' as const,
    ts: '2024-01-01T00:00:00.000Z',
    runId: 'run-1',
    phaseId: 'phase-uuid-1',
    payload: {
      severity: 'high',
      category: 'security',
      title: 'SQL Injection found',
      filePath: 'src/db.ts',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/runs
// ---------------------------------------------------------------------------

describe('GET /api/runs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with an array of runs sorted by startedAt descending', async () => {
    const runA = makeRun({ id: 'run-a', startedAt: '2024-01-01T00:00:00.000Z' });
    const runB = makeRun({ id: 'run-b', startedAt: '2024-01-02T00:00:00.000Z' });

    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-a', 'run-b']);
    vi.mocked(jsonlReader.readRunEventsAll).mockResolvedValue([[], []]);
    vi.mocked(jsonlReader.buildRunFromEvents)
      .mockImplementation((_id, _events) => {
        if (_id === 'run-a') return runA;
        return runB;
      });

    const { GET } = await import('../../apps/ui/app/api/runs/route.ts');
    const response = await GET() as unknown as MockNextResponse;
    const body = await response.json() as typeof runA[];

    expect(response.status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    // Sorted descending: run-b (2024-01-02) should come first
    expect(body[0].id).toBe('run-b');
    expect(body[1].id).toBe('run-a');
  });

  it('returns 200 with an empty array when there are no runs', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue([]);

    const { GET } = await import('../../apps/ui/app/api/runs/route.ts');
    const response = await GET() as unknown as MockNextResponse;
    const body = await response.json() as unknown[];

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns 500 when listRunIds throws', async () => {
    vi.mocked(jsonlReader.listRunIds).mockRejectedValue(new Error('disk error'));

    const { GET } = await import('../../apps/ui/app/api/runs/route.ts');
    const response = await GET() as unknown as MockNextResponse;
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// GET /api/runs/:runId
// ---------------------------------------------------------------------------

describe('GET /api/runs/:runId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with run and phases when runId exists', async () => {
    const run = makeRun({ id: 'run-1' });
    const phases = [makePhase()];

    vi.mocked(jsonlReader.readRunEvents).mockResolvedValue([
      { ts: '2024-01-01T00:00:00.000Z', runId: 'run-1', eventType: 'run_start', payload: {} },
    ]);
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.buildRunFromEvents).mockReturnValue(run);
    vi.mocked(jsonlReader.buildPhasesFromEvents).mockReturnValue(phases);

    const { GET } = await import('../../apps/ui/app/api/runs/[runId]/route.ts');
    const response = await GET(
      {} as Request,
      { params: { runId: 'run-1' } },
    ) as unknown as MockNextResponse;
    const body = await response.json() as { run: typeof run; phases: typeof phases };

    expect(response.status).toBe(200);
    expect(body.run.id).toBe('run-1');
    expect(Array.isArray(body.phases)).toBe(true);
    expect(body.phases[0].phase).toBe('develop');
  });

  it('returns 404 when runId is not found and events are empty', async () => {
    vi.mocked(jsonlReader.readRunEvents).mockResolvedValue([]);
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-other']);

    const { GET } = await import('../../apps/ui/app/api/runs/[runId]/route.ts');
    const response = await GET(
      {} as Request,
      { params: { runId: 'run-missing' } },
    ) as unknown as MockNextResponse;

    expect(response.status).toBe(404);
    const body = await response.json() as { error: string };
    expect(body).toHaveProperty('error');
  });

  it('returns 200 with empty phases when run exists but has no phase events', async () => {
    const run = makeRun({ id: 'run-1' });

    vi.mocked(jsonlReader.readRunEvents).mockResolvedValue([
      { ts: '2024-01-01T00:00:00.000Z', runId: 'run-1', eventType: 'run_start', payload: {} },
    ]);
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.buildRunFromEvents).mockReturnValue(run);
    vi.mocked(jsonlReader.buildPhasesFromEvents).mockReturnValue([]);

    const { GET } = await import('../../apps/ui/app/api/runs/[runId]/route.ts');
    const response = await GET(
      {} as Request,
      { params: { runId: 'run-1' } },
    ) as unknown as MockNextResponse;
    const body = await response.json() as { run: typeof run; phases: unknown[] };

    expect(response.status).toBe(200);
    expect(body.phases).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/issues/:issueId
// ---------------------------------------------------------------------------

describe('GET /api/issues/:issueId', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with runs filtered by issueId, sorted desc', async () => {
    const runA = makeRun({ id: 'run-a', issueId: 'MOB-1023', startedAt: '2024-01-01T00:00:00.000Z' });
    const runB = makeRun({ id: 'run-b', issueId: 'MOB-1023', startedAt: '2024-01-02T00:00:00.000Z' });
    const runC = makeRun({ id: 'run-c', issueId: 'MOB-9999', startedAt: '2024-01-03T00:00:00.000Z' });

    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-a', 'run-b', 'run-c']);
    vi.mocked(jsonlReader.readRunEventsAll).mockResolvedValue([[], [], []]);
    vi.mocked(jsonlReader.buildRunFromEvents).mockImplementation((_id) => {
      if (_id === 'run-a') return runA;
      if (_id === 'run-b') return runB;
      return runC;
    });

    const { GET } = await import('../../apps/ui/app/api/issues/[issueId]/route.ts');
    const response = await GET(
      {} as Request,
      { params: { issueId: 'MOB-1023' } },
    ) as unknown as MockNextResponse;
    const body = await response.json() as typeof runA[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.every((r) => r.issueId === 'MOB-1023')).toBe(true);
    // Sorted descending: run-b (newer) first
    expect(body[0].id).toBe('run-b');
  });

  it('returns 200 with empty array when no runs match the issueId', async () => {
    const run = makeRun({ issueId: 'MOB-9999' });

    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.readRunEventsAll).mockResolvedValue([[]]);
    vi.mocked(jsonlReader.buildRunFromEvents).mockReturnValue(run);

    const { GET } = await import('../../apps/ui/app/api/issues/[issueId]/route.ts');
    const response = await GET(
      {} as Request,
      { params: { issueId: 'MOB-1023' } },
    ) as unknown as MockNextResponse;
    const body = await response.json() as unknown[];

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns 500 when listRunIds throws', async () => {
    vi.mocked(jsonlReader.listRunIds).mockRejectedValue(new Error('disk error'));

    const { GET } = await import('../../apps/ui/app/api/issues/[issueId]/route.ts');
    const response = await GET(
      {} as Request,
      { params: { issueId: 'MOB-1023' } },
    ) as unknown as MockNextResponse;
    const body = await response.json() as { error: string };

    expect(response.status).toBe(500);
    expect(body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// GET /api/cost
// ---------------------------------------------------------------------------

describe('GET /api/cost', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with zero totals when there are no runs', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue([]);

    const { GET } = await import('../../apps/ui/app/api/cost/route.ts');
    const response = await GET() as unknown as MockNextResponse;
    const body = await response.json() as {
      totalUsd: string;
      byRun: Record<string, string>;
      byModel: Record<string, string>;
      byPhase: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(body.totalUsd).toBe('0.000000');
    expect(body.byRun).toEqual({});
    expect(body.byModel).toEqual({});
    expect(body.byPhase).toEqual({});
  });

  it('returns 200 with correct cost breakdown from cost events', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.readRunEventsAll).mockResolvedValue([[
      {
        ts: '2024-01-01T00:00:00.000Z',
        runId: 'run-1',
        eventType: 'cost',
        payload: {
          costUsd: 0.001,
          model: 'claude-sonnet-4-6',
          phase: 'develop',
        },
      },
      {
        ts: '2024-01-01T00:01:00.000Z',
        runId: 'run-1',
        eventType: 'cost',
        payload: {
          costUsd: 0.002,
          model: 'claude-haiku-4-5',
          phase: 'test',
        },
      },
    ]]);

    const { GET } = await import('../../apps/ui/app/api/cost/route.ts');
    const response = await GET() as unknown as MockNextResponse;
    const body = await response.json() as {
      totalUsd: string;
      byRun: Record<string, string>;
      byModel: Record<string, string>;
      byPhase: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(body.totalUsd).toBe('0.003000');
    expect(body.byRun['run-1']).toBe('0.003000');
    expect(body.byModel['claude-sonnet-4-6']).toBe('0.001000');
    expect(body.byModel['claude-haiku-4-5']).toBe('0.002000');
    expect(body.byPhase['develop']).toBe('0.001000');
    expect(body.byPhase['test']).toBe('0.002000');
  });

  it('returns 200 with run entry showing zero cost when run has no cost events', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-empty']);
    vi.mocked(jsonlReader.readRunEventsAll).mockResolvedValue([[
      {
        ts: '2024-01-01T00:00:00.000Z',
        runId: 'run-empty',
        eventType: 'run_start',
        payload: {},
      },
    ]]);

    const { GET } = await import('../../apps/ui/app/api/cost/route.ts');
    const response = await GET() as unknown as MockNextResponse;
    const body = await response.json() as {
      totalUsd: string;
      byRun: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(body.totalUsd).toBe('0.000000');
    expect(body.byRun['run-empty']).toBe('0.000000');
  });

  it('returns 500 when readRunEventsAll throws', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.readRunEventsAll).mockRejectedValue(new Error('read error'));

    const { GET } = await import('../../apps/ui/app/api/cost/route.ts');
    const response = await GET() as unknown as MockNextResponse;

    expect(response.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/findings
// ---------------------------------------------------------------------------

describe('GET /api/findings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with grouped findings when runs have finding events', async () => {
    const findingEvent = makeFindingEvent();
    const phaseStartEvent = {
      ts: '2024-01-01T00:00:00.000Z',
      runId: 'run-1',
      eventType: 'phase_start' as const,
      phaseId: 'phase-uuid-1',
      payload: { phase: 'security' },
    };

    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.readRunEvents).mockResolvedValue([phaseStartEvent, findingEvent]);

    const { GET } = await import('../../apps/ui/app/api/findings/route.ts');
    const mockRequest = new (await import('next/server')).NextRequest('http://localhost/api/findings');
    const response = await GET(mockRequest) as unknown as MockNextResponse;
    const body = await response.json() as {
      critical: unknown[];
      high: unknown[];
      medium: unknown[];
      low: unknown[];
      total: number;
    };

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('critical');
    expect(body).toHaveProperty('high');
    expect(body).toHaveProperty('medium');
    expect(body).toHaveProperty('low');
    expect(body).toHaveProperty('total');
    expect(body.high).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('returns 200 with all empty groups when there are no finding events', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.readRunEvents).mockResolvedValue([
      { ts: '2024-01-01T00:00:00.000Z', runId: 'run-1', eventType: 'run_start', payload: {} },
    ]);

    const { GET } = await import('../../apps/ui/app/api/findings/route.ts');
    const mockRequest = new (await import('next/server')).NextRequest('http://localhost/api/findings');
    const response = await GET(mockRequest) as unknown as MockNextResponse;
    const body = await response.json() as {
      critical: unknown[];
      high: unknown[];
      medium: unknown[];
      low: unknown[];
      total: number;
    };

    expect(response.status).toBe(200);
    expect(body.critical).toEqual([]);
    expect(body.high).toEqual([]);
    expect(body.medium).toEqual([]);
    expect(body.low).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('filters by runId query param', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1', 'run-2']);
    vi.mocked(jsonlReader.readRunEvents).mockImplementation(async (runId) => {
      if (runId === 'run-1') {
        return [makeFindingEvent({ runId: 'run-1' })];
      }
      return [makeFindingEvent({ runId: 'run-2', payload: { severity: 'critical', category: 'injection', title: 'Critical bug' } })];
    });

    const { GET } = await import('../../apps/ui/app/api/findings/route.ts');
    const mockRequest = new (await import('next/server')).NextRequest(
      'http://localhost/api/findings?runId=run-1',
    );
    const response = await GET(mockRequest) as unknown as MockNextResponse;
    const body = await response.json() as {
      high: Array<{ runId: string }>;
      total: number;
    };

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.high[0].runId).toBe('run-1');
  });

  it('defaults unknown severity to "low"', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.readRunEvents).mockResolvedValue([
      makeFindingEvent({
        payload: { severity: 'unknown-level', category: 'misc', title: 'Weird finding' },
      }),
    ]);

    const { GET } = await import('../../apps/ui/app/api/findings/route.ts');
    const mockRequest = new (await import('next/server')).NextRequest('http://localhost/api/findings');
    const response = await GET(mockRequest) as unknown as MockNextResponse;
    const body = await response.json() as {
      low: unknown[];
      total: number;
    };

    expect(response.status).toBe(200);
    expect(body.low).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('assigns a generated id when finding payload has no id', async () => {
    vi.mocked(jsonlReader.listRunIds).mockResolvedValue(['run-1']);
    vi.mocked(jsonlReader.readRunEvents).mockResolvedValue([
      makeFindingEvent({ payload: { severity: 'high', category: 'security', title: 'No ID finding' } }),
    ]);

    const { GET } = await import('../../apps/ui/app/api/findings/route.ts');
    const mockRequest = new (await import('next/server')).NextRequest('http://localhost/api/findings');
    const response = await GET(mockRequest) as unknown as MockNextResponse;
    const body = await response.json() as {
      high: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.high[0].id).toBe('run-1-0'); // generated: `${runId}-${index}`
  });
});
