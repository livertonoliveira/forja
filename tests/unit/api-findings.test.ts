/**
 * Integration tests for apps/ui/app/api/findings/route.ts
 *
 * Covers:
 * - No run IDs available → empty grouped result with total 0
 * - Mock JSONL data with findings → grouped correctly by severity
 * - ?runId= filter → returns only that run's findings
 * - Unknown severity → defaults to 'low'
 * - phase_start context → finding picks up resolved phase name
 * - filePath extraction → short relative path vs basename fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TraceEventRaw } from '../../apps/ui/lib/jsonl-reader.ts';

// ---------------------------------------------------------------------------
// Mock @/lib/jsonl-reader before importing the route module
// ---------------------------------------------------------------------------

vi.mock('@/lib/jsonl-reader', () => ({
  listRunIds: vi.fn(),
  readRunEvents: vi.fn(),
}));

import { listRunIds, readRunEvents } from '@/lib/jsonl-reader';
import { GET } from '../../apps/ui/app/api/findings/route.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_A = '00000000-0000-0000-0000-000000000001';
const RUN_B = '00000000-0000-0000-0000-000000000002';
const TS = '2024-01-01T00:00:00.000Z';

function makeRequest(url: string) {
  return { url } as import('next/server').NextRequest;
}

function makeFindingEvent(
  runId: string,
  payload: Record<string, unknown>,
  phaseId?: string,
): TraceEventRaw {
  return {
    ts: TS,
    runId,
    eventType: 'finding',
    payload,
    ...(phaseId ? { phaseId } : {}),
  };
}

function makePhaseStartEvent(
  runId: string,
  phaseId: string,
  phaseName: string,
): TraceEventRaw {
  return {
    ts: TS,
    runId,
    eventType: 'phase_start',
    phaseId,
    payload: { phase: phaseName },
  };
}

// ---------------------------------------------------------------------------
// Test: no run IDs available
// ---------------------------------------------------------------------------

describe('GET /api/findings — no runs', () => {
  beforeEach(() => {
    vi.mocked(listRunIds).mockResolvedValue([]);
    vi.mocked(readRunEvents).mockResolvedValue([]);
  });

  it('returns empty arrays for all severities and total 0', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();

    expect(body).toEqual({ critical: [], high: [], medium: [], low: [], total: 0 });
  });

  it('returns HTTP 200', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Test: findings grouped correctly by severity
// ---------------------------------------------------------------------------

describe('GET /api/findings — grouping by severity', () => {
  beforeEach(() => {
    vi.mocked(listRunIds).mockResolvedValue([RUN_A]);
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'critical', category: 'injection', title: 'SQL injection' }),
      makeFindingEvent(RUN_A, { id: 'f2', severity: 'high', category: 'xss', title: 'XSS found' }),
      makeFindingEvent(RUN_A, { id: 'f3', severity: 'high', category: 'xss', title: 'Another XSS' }),
      makeFindingEvent(RUN_A, { id: 'f4', severity: 'medium', category: 'csrf', title: 'CSRF risk' }),
      makeFindingEvent(RUN_A, { id: 'f5', severity: 'low', category: 'info', title: 'Informational' }),
    ]);
  });

  it('groups findings into correct severity buckets', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();

    expect(body.critical).toHaveLength(1);
    expect(body.high).toHaveLength(2);
    expect(body.medium).toHaveLength(1);
    expect(body.low).toHaveLength(1);
  });

  it('returns correct total count', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.total).toBe(5);
  });

  it('includes the runId on each finding', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.critical[0].runId).toBe(RUN_A);
  });

  it('uses payload.id as the finding id', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.critical[0].id).toBe('f1');
  });

  it('falls back to generated id when payload has no id', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { severity: 'low', title: 'No id' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    // generated id format: `${runId}-${index}`
    expect(body.low[0].id).toBe(`${RUN_A}-0`);
  });
});

// ---------------------------------------------------------------------------
// Test: unknown severity defaults to 'low'
// ---------------------------------------------------------------------------

describe('GET /api/findings — unknown severity', () => {
  beforeEach(() => {
    vi.mocked(listRunIds).mockResolvedValue([RUN_A]);
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f-bad', severity: 'bogus', title: 'Unknown severity' }),
      makeFindingEvent(RUN_A, { id: 'f-none', title: 'No severity field' }),
    ]);
  });

  it('puts findings with unknown severity into the low bucket', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low).toHaveLength(2);
    expect(body.critical).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test: ?runId= filter
// ---------------------------------------------------------------------------

describe('GET /api/findings — runId filter', () => {
  beforeEach(() => {
    vi.mocked(listRunIds).mockResolvedValue([RUN_A, RUN_B]);
    vi.mocked(readRunEvents).mockImplementation(async (runId: string) => {
      if (runId === RUN_A) {
        return [makeFindingEvent(RUN_A, { id: 'a1', severity: 'critical', title: 'Run A finding' })];
      }
      if (runId === RUN_B) {
        return [makeFindingEvent(RUN_B, { id: 'b1', severity: 'high', title: 'Run B finding' })];
      }
      return [];
    });
  });

  it('returns only findings from the specified runId', async () => {
    const req = makeRequest(`http://localhost/api/findings?runId=${RUN_A}`);
    const res = await GET(req);
    const body = await res.json();

    expect(body.critical).toHaveLength(1);
    expect(body.critical[0].id).toBe('a1');
    expect(body.high).toHaveLength(0);
    expect(body.total).toBe(1);
  });

  it('returns empty when runId does not match any existing run', async () => {
    const req = makeRequest('http://localhost/api/findings?runId=nonexistent-id');
    const res = await GET(req);
    const body = await res.json();

    expect(body.total).toBe(0);
  });

  it('returns findings from all runs when no runId filter is provided', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();

    expect(body.critical).toHaveLength(1);
    expect(body.high).toHaveLength(1);
    expect(body.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test: phase name resolution from phase_start events
// ---------------------------------------------------------------------------

describe('GET /api/findings — phase name resolution', () => {
  const PHASE_ID = 'phase-uuid-0001';

  beforeEach(() => {
    vi.mocked(listRunIds).mockResolvedValue([RUN_A]);
    vi.mocked(readRunEvents).mockResolvedValue([
      makePhaseStartEvent(RUN_A, PHASE_ID, 'security'),
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'high', title: 'Finding in phase' }, PHASE_ID),
    ]);
  });

  it('resolves phaseId to human-readable phase name', async () => {
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.high[0].phase).toBe('security');
  });
});

// ---------------------------------------------------------------------------
// Test: filePath extraction
// ---------------------------------------------------------------------------

describe('GET /api/findings — filePath extraction', () => {
  beforeEach(() => {
    vi.mocked(listRunIds).mockResolvedValue([RUN_A]);
  });

  it('extracts relative path matching src/ prefix', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'low', title: 'T', filePath: '/home/user/project/src/auth/login.ts' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low[0].file).toBe('src/auth/login.ts');
  });

  it('extracts relative path matching apps/ prefix', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'low', title: 'T', filePath: '/home/user/project/apps/ui/page.tsx' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low[0].file).toBe('apps/ui/page.tsx');
  });

  it('falls back to basename when path does not match known prefixes', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'low', title: 'T', filePath: '/home/user/other/util.ts' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low[0].file).toBe('util.ts');
  });

  it('sets file to null when no filePath in payload', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'low', title: 'T' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low[0].file).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test: message fallback chain
// ---------------------------------------------------------------------------

describe('GET /api/findings — message fallback', () => {
  beforeEach(() => {
    vi.mocked(listRunIds).mockResolvedValue([RUN_A]);
  });

  it('uses payload.title as message when present', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'low', title: 'Title message' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low[0].message).toBe('Title message');
  });

  it('falls back to payload.description when title is absent', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'low', description: 'Desc message' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low[0].message).toBe('Desc message');
  });

  it('uses "No message" when both title and description are absent', async () => {
    vi.mocked(readRunEvents).mockResolvedValue([
      makeFindingEvent(RUN_A, { id: 'f1', severity: 'low' }),
    ]);
    const req = makeRequest('http://localhost/api/findings');
    const res = await GET(req);
    const body = await res.json();
    expect(body.low[0].message).toBe('No message');
  });
});
