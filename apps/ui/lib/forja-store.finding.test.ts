/**
 * Unit tests for getFinding and getFindingHistory in apps/ui/lib/forja-store.ts (MOB-1072)
 *
 * Tests DB null path, not-found path, successful mapping, and error handling.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/lib/forja-store.finding.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('./db', () => ({
  getPool: vi.fn(),
}));

vi.mock('./jsonl-reader', () => ({
  listRunIds: vi.fn().mockResolvedValue([]),
  readRunSummaryEventsAll: vi.fn().mockResolvedValue([]),
  buildRunFromEvents: vi.fn(),
  readRunEventsAll: vi.fn().mockResolvedValue([]),
}));

vi.mock('./findings-parser', () => ({
  parseFindings: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { getPool } from './db';

const mockGetPool = getPool as ReturnType<typeof vi.fn>;

/** Creates a mock pool whose query method returns the given rows on first call */
function makePool(queryResponses: Array<{ rows: unknown[] }>) {
  let callCount = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const response = queryResponses[callCount] ?? { rows: [] };
      callCount++;
      return Promise.resolve(response);
    }),
  };
}

/** Makes a mock pool whose query always rejects */
function makePoolThatThrows(errorMessage = 'DB error') {
  return {
    query: vi.fn().mockRejectedValue(new Error(errorMessage)),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FINDING_ROW = {
  id: 'finding-abc',
  fingerprint: 'fp-xyz-123',
  severity: 'high' as const,
  category: 'security',
  title: 'SQL Injection',
  description: 'Unsanitized input passed to query',
  file_path: 'src/db/query.ts',
  line: 42,
  run_id: 'run-001',
  issue_id: 'MOB-100',
  git_branch: 'main',
  git_sha: 'deadbeef',
  started_at: '2025-04-01T10:00:00Z',
};

const HISTORY_BASE_ROW = {
  fingerprint: 'fp-xyz-123',
  started_at: '2025-04-01T10:00:00Z',
};

const HISTORY_ENTRY_ROW = {
  run_id: 'run-000',
  issue_id: 'MOB-099',
  started_at: '2025-03-20T08:00:00Z',
  gate_decision: 'fail' as const,
  severity: 'high' as const,
};

// ---------------------------------------------------------------------------
// getFinding tests
// ---------------------------------------------------------------------------

describe('getFinding — no DB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(null);
  });

  it('returns null when getPool() returns null', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result).toBeNull();
  });
});

describe('getFinding — finding not found', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(makePool([{ rows: [] }]));
  });

  it('returns null when rows.length === 0', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('nonexistent-id');
    expect(result).toBeNull();
  });
});

describe('getFinding — successful mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(makePool([{ rows: [FINDING_ROW] }]));
  });

  it('returns a FindingDetail when the finding exists', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result).not.toBeNull();
  });

  it('maps id correctly', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.id).toBe('finding-abc');
  });

  it('maps description to message', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.message).toBe('Unsanitized input passed to query');
  });

  it('maps file_path to filePath', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.filePath).toBe('src/db/query.ts');
  });

  it('maps run_id to runId', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.runId).toBe('run-001');
  });

  it('includes run.issueId from issue_id', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.run.issueId).toBe('MOB-100');
  });

  it('includes run.gitBranch from git_branch', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.run.gitBranch).toBe('main');
  });

  it('includes run.gitSha from git_sha', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.run.gitSha).toBe('deadbeef');
  });

  it('includes run.createdAt from started_at', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.run.createdAt).toBe('2025-04-01T10:00:00Z');
  });

  it('preserves fingerprint, severity, category, title, and line', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.fingerprint).toBe('fp-xyz-123');
    expect(result?.severity).toBe('high');
    expect(result?.category).toBe('security');
    expect(result?.title).toBe('SQL Injection');
    expect(result?.line).toBe(42);
  });
});

describe('getFinding — handles null optional fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const nullableRow = {
      ...FINDING_ROW,
      fingerprint: null,
      file_path: null,
      line: null,
      git_branch: null,
      git_sha: null,
    };
    mockGetPool.mockResolvedValue(makePool([{ rows: [nullableRow] }]));
  });

  it('maps null file_path to null filePath', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.filePath).toBeNull();
  });

  it('maps null fingerprint to null', async () => {
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result?.fingerprint).toBeNull();
  });
});

describe('getFinding — DB throws error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(makePoolThatThrows());
  });

  it('returns null and logs error when DB throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getFinding } = await import('./forja-store');
    const result = await getFinding('finding-abc');
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[forja-store]'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getFindingHistory tests
// ---------------------------------------------------------------------------

describe('getFindingHistory — no DB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(null);
  });

  it('returns empty array when getPool() returns null', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result).toEqual([]);
  });
});

describe('getFindingHistory — finding not found (first query empty)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(makePool([{ rows: [] }]));
  });

  it('returns empty array when first query returns no rows', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('nonexistent-id');
    expect(result).toEqual([]);
  });
});

describe('getFindingHistory — finding has no fingerprint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const baseRowNoFingerprint = { fingerprint: null, started_at: '2025-04-01T10:00:00Z' };
    mockGetPool.mockResolvedValue(makePool([{ rows: [baseRowNoFingerprint] }]));
  });

  it('returns empty array when fingerprint is null', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result).toEqual([]);
  });
});

describe('getFindingHistory — returns previous runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(
      makePool([
        { rows: [HISTORY_BASE_ROW] },
        { rows: [HISTORY_ENTRY_ROW] },
      ]),
    );
  });

  it('returns an array with one entry when one previous run exists', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result).toHaveLength(1);
  });

  it('maps run_id to runId', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result[0].runId).toBe('run-000');
  });

  it('maps issue_id to issueId', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result[0].issueId).toBe('MOB-099');
  });

  it('maps started_at to createdAt', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result[0].createdAt).toBe('2025-03-20T08:00:00Z');
  });

  it('maps gate_decision to gateDecision', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result[0].gateDecision).toBe('fail');
  });

  it('preserves severity', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result[0].severity).toBe('high');
  });
});

describe('getFindingHistory — returns up to 20 entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const historyRows = Array.from({ length: 20 }, (_, i) => ({
      run_id: `run-${String(i).padStart(3, '0')}`,
      issue_id: `MOB-${i}`,
      started_at: `2025-03-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
      gate_decision: null,
      severity: 'medium' as const,
    }));
    mockGetPool.mockResolvedValue(
      makePool([{ rows: [HISTORY_BASE_ROW] }, { rows: historyRows }]),
    );
  });

  it('returns up to 20 previous run entries', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result).toHaveLength(20);
  });

  it('each entry has the expected shape', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    for (const entry of result) {
      expect(entry).toHaveProperty('runId');
      expect(entry).toHaveProperty('issueId');
      expect(entry).toHaveProperty('createdAt');
      expect(entry).toHaveProperty('gateDecision');
      expect(entry).toHaveProperty('severity');
    }
  });
});

describe('getFindingHistory — null gateDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const entryWithNullGate = { ...HISTORY_ENTRY_ROW, gate_decision: null };
    mockGetPool.mockResolvedValue(
      makePool([{ rows: [HISTORY_BASE_ROW] }, { rows: [entryWithNullGate] }]),
    );
  });

  it('maps null gate_decision to null gateDecision', async () => {
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result[0].gateDecision).toBeNull();
  });
});

describe('getFindingHistory — DB throws error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPool.mockResolvedValue(makePoolThatThrows());
  });

  it('returns empty array and logs error when DB throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getFindingHistory } = await import('./forja-store');
    const result = await getFindingHistory('finding-abc');
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[forja-store]'),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
