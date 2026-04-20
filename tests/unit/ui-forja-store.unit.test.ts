/**
 * Unit tests for apps/ui/lib/forja-store.ts — listAllFindings()
 *
 * Covers:
 * - Returns empty array when no runs exist
 * - Aggregates findings from multiple runs
 * - Falls back severity='low' for unknown/missing severity values
 * - Falls back category='unknown' when missing
 * - Falls back message='No message' when no title/description
 * - Generates ID as `${runId}-${index}` when no ID in payload
 * - Resolves phase name via phaseNameById map
 * - File path extraction (src/..., apps/..., packages/... matches; falls back to basename)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock setup — vi.mock must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../apps/ui/lib/jsonl-reader.ts', () => ({
  listRunIds: vi.fn(),
  readRunEventsAll: vi.fn(),
}));

import { listAllFindings } from '../../apps/ui/lib/forja-store.ts';
import { listRunIds, readRunEventsAll } from '../../apps/ui/lib/jsonl-reader.ts';
import type { TraceEventRaw } from '../../apps/ui/lib/jsonl-reader.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PHASE_A = 'phase-uuid-1';

const mockedListRunIds = vi.mocked(listRunIds);
const mockedReadRunEventsAll = vi.mocked(readRunEventsAll);

function makeFindingEvent(
  runId: string,
  payload: Record<string, unknown>,
  overrides: Partial<TraceEventRaw> = {},
): TraceEventRaw {
  return {
    ts: '2024-01-01T00:00:00.000Z',
    runId,
    eventType: 'finding',
    payload,
    ...overrides,
  };
}

function makePhaseStartEvent(
  runId: string,
  phaseId: string,
  phaseName: string,
): TraceEventRaw {
  return {
    ts: '2024-01-01T00:00:00.000Z',
    runId,
    phaseId,
    eventType: 'phase_start',
    payload: { phase: phaseName },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Empty runs
// ---------------------------------------------------------------------------

describe('listAllFindings — no runs', () => {
  it('returns empty array when listRunIds returns no runs', async () => {
    mockedListRunIds.mockResolvedValue([]);
    mockedReadRunEventsAll.mockResolvedValue([]);

    const result = await listAllFindings();

    expect(result).toEqual([]);
  });

  it('returns empty array when a run has no events', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[]]);

    const result = await listAllFindings();

    expect(result).toEqual([]);
  });

  it('returns empty array when events contain no finding events', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      { ts: '2024-01-01T00:00:00.000Z', runId: RUN_A, eventType: 'run_start', payload: { issueId: 'MOB-1' } },
      { ts: '2024-01-01T00:01:00.000Z', runId: RUN_A, eventType: 'run_end', payload: { status: 'done' } },
    ]]);

    const result = await listAllFindings();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Single run with findings
// ---------------------------------------------------------------------------

describe('listAllFindings — single run', () => {
  it('returns a single finding with correct fields', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, {
        id: 'finding-001',
        severity: 'high',
        category: 'security',
        title: 'SQL Injection detected',
        filePath: 'src/db/query.ts',
      }),
    ]]);

    const result = await listAllFindings();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'finding-001',
      severity: 'high',
      category: 'security',
      message: 'SQL Injection detected',
      file: 'src/db/query.ts',
      runId: RUN_A,
      phase: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Multiple runs — aggregation
// ---------------------------------------------------------------------------

describe('listAllFindings — multiple runs', () => {
  it('aggregates findings from two runs', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A, RUN_B]);
    mockedReadRunEventsAll.mockResolvedValue([
      [
        makeFindingEvent(RUN_A, { id: 'f-a1', severity: 'critical', category: 'security', title: 'Issue A1' }),
        makeFindingEvent(RUN_A, { id: 'f-a2', severity: 'low', category: 'style', title: 'Issue A2' }),
      ],
      [
        makeFindingEvent(RUN_B, { id: 'f-b1', severity: 'medium', category: 'performance', title: 'Issue B1' }),
      ],
    ]);

    const result = await listAllFindings();

    expect(result).toHaveLength(3);
    const runIds = result.map((f) => f.runId);
    expect(runIds.filter((id) => id === RUN_A)).toHaveLength(2);
    expect(runIds.filter((id) => id === RUN_B)).toHaveLength(1);
  });

  it('preserves the correct runId for each finding', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A, RUN_B]);
    mockedReadRunEventsAll.mockResolvedValue([
      [makeFindingEvent(RUN_A, { id: `f-${RUN_A}`, severity: 'low', category: 'test', title: 'Finding' })],
      [makeFindingEvent(RUN_B, { id: `f-${RUN_B}`, severity: 'low', category: 'test', title: 'Finding' })],
    ]);

    const result = await listAllFindings();

    expect(result.find((f) => f.runId === RUN_A)).toBeDefined();
    expect(result.find((f) => f.runId === RUN_B)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Severity fallback
// ---------------------------------------------------------------------------

describe('listAllFindings — severity fallback', () => {
  it('falls back to "low" when severity is an unknown value', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'unknown-level', category: 'test', title: 'Bad severity' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.severity).toBe('low');
  });

  it('falls back to "low" when severity is undefined', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', category: 'test', title: 'No severity' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.severity).toBe('low');
  });

  it('accepts all valid severity values without falling back', async () => {
    const validSeverities = ['critical', 'high', 'medium', 'low'] as const;
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([
      validSeverities.map((sev, i) =>
        makeFindingEvent(RUN_A, { id: `f-${i}`, severity: sev, category: 'test', title: `Finding ${sev}` }),
      ),
    ]);

    const results = await listAllFindings();
    expect(results.map((f) => f.severity)).toEqual(['critical', 'high', 'medium', 'low']);
  });
});

// ---------------------------------------------------------------------------
// Category fallback
// ---------------------------------------------------------------------------

describe('listAllFindings — category fallback', () => {
  it('falls back to "unknown" when category is missing', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'medium', title: 'No category finding' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.category).toBe('unknown');
  });

  it('uses the provided category when present', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'performance', title: 'Slow path' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.category).toBe('performance');
  });
});

// ---------------------------------------------------------------------------
// Message fallback
// ---------------------------------------------------------------------------

describe('listAllFindings — message fallback', () => {
  it('falls back to "No message" when both title and description are absent', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.message).toBe('No message');
  });

  it('prefers title over description when both are present', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, {
        id: 'f-1',
        severity: 'low',
        category: 'test',
        title: 'Primary title',
        description: 'Fallback description',
      }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.message).toBe('Primary title');
  });

  it('uses description when title is absent', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, {
        id: 'f-1',
        severity: 'low',
        category: 'test',
        description: 'Description only',
      }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.message).toBe('Description only');
  });
});

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

describe('listAllFindings — ID generation', () => {
  it('generates ID as `${runId}-${index}` when payload has no id', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { severity: 'low', category: 'test', title: 'First' }),
      makeFindingEvent(RUN_A, { severity: 'high', category: 'security', title: 'Second' }),
    ]]);

    const results = await listAllFindings();

    expect(results[0].id).toBe(`${RUN_A}-0`);
    expect(results[1].id).toBe(`${RUN_A}-1`);
  });

  it('uses the id from the payload when present', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'explicit-id-42', severity: 'low', category: 'test', title: 'With ID' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.id).toBe('explicit-id-42');
  });

  it('uses the index independently per run (both runs index from 0)', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A, RUN_B]);
    mockedReadRunEventsAll.mockResolvedValue([
      [makeFindingEvent(RUN_A, { severity: 'low', category: 'test', title: 'Finding' })],
      [makeFindingEvent(RUN_B, { severity: 'low', category: 'test', title: 'Finding' })],
    ]);

    const results = await listAllFindings();

    const runAFinding = results.find((f) => f.runId === RUN_A)!;
    const runBFinding = results.find((f) => f.runId === RUN_B)!;
    expect(runAFinding.id).toBe(`${RUN_A}-0`);
    expect(runBFinding.id).toBe(`${RUN_B}-0`);
  });
});

// ---------------------------------------------------------------------------
// Phase resolution
// ---------------------------------------------------------------------------

describe('listAllFindings — phase resolution', () => {
  it('resolves phase name from phaseNameById map when phaseId matches a phase_start event', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makePhaseStartEvent(RUN_A, PHASE_A, 'security'),
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'high', category: 'security', title: 'XSS' }, { phaseId: PHASE_A }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.phase).toBe('security');
  });

  it('falls back to phaseId string when no matching phase_start exists', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'Orphan' }, { phaseId: 'orphan-phase-id' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.phase).toBe('orphan-phase-id');
  });

  it('sets phase to null when finding event has no phaseId', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'No phase' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.phase).toBeNull();
  });

  it('uses phaseId value when phase_start payload has no phase name', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      {
        ts: '2024-01-01T00:00:00.000Z',
        runId: RUN_A,
        phaseId: PHASE_A,
        eventType: 'phase_start',
        payload: {},
      },
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'T' }, { phaseId: PHASE_A }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.phase).toBe(PHASE_A);
  });
});

// ---------------------------------------------------------------------------
// File path extraction
// ---------------------------------------------------------------------------

describe('listAllFindings — file path extraction', () => {
  it('extracts src/... path from filePath', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'T', filePath: '/home/user/project/src/utils/helper.ts' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.file).toBe('src/utils/helper.ts');
  });

  it('extracts apps/... path from filePath', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'T', filePath: '/home/user/project/apps/ui/components/Button.tsx' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.file).toBe('apps/ui/components/Button.tsx');
  });

  it('extracts packages/... path from filePath', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'T', filePath: '/home/user/project/packages/shared/index.ts' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.file).toBe('packages/shared/index.ts');
  });

  it('falls back to basename when filePath does not match src/apps/packages patterns', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'T', filePath: '/home/user/vendor/lib/utils.ts' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.file).toBe('utils.ts');
  });

  it('sets file to null when filePath is absent', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'T' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.file).toBeNull();
  });

  it('uses a relative filePath that already matches src/... pattern verbatim', async () => {
    mockedListRunIds.mockResolvedValue([RUN_A]);
    mockedReadRunEventsAll.mockResolvedValue([[
      makeFindingEvent(RUN_A, { id: 'f-1', severity: 'low', category: 'test', title: 'T', filePath: 'src/db/client.ts' }),
    ]]);

    const [finding] = await listAllFindings();
    expect(finding.file).toBe('src/db/client.ts');
  });
});
