/**
 * Unit tests for issues pages logic from apps/ui/app/issues/
 *
 * Covers:
 * - isRegression(): all gate combinations, null handling
 * - Issue grouping logic from IssuesPage: runCount, lastGate, lastRun from newest-first array
 */

import { describe, it, expect } from 'vitest';
import type { Run } from '../../apps/ui/lib/types.ts';

// ---------------------------------------------------------------------------
// isRegression — extracted from apps/ui/app/issues/[issueId]/page.tsx
// ---------------------------------------------------------------------------

const gateWeight: Record<string, number> = { fail: 0, warn: 1, pass: 2 };

function isRegression(
  current: Run['gateFinal'],
  previous: Run['gateFinal'],
): boolean {
  if (current === null || previous === null) return false;
  return gateWeight[current] < gateWeight[previous];
}

// ---------------------------------------------------------------------------
// isRegression — regressions (gate degradation)
// ---------------------------------------------------------------------------

describe('isRegression — regressions (gate goes down)', () => {
  it('pass → warn is a regression', () => {
    expect(isRegression('warn', 'pass')).toBe(true);
  });

  it('pass → fail is a regression', () => {
    expect(isRegression('fail', 'pass')).toBe(true);
  });

  it('warn → fail is a regression', () => {
    expect(isRegression('fail', 'warn')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isRegression — no regressions (gate improves or stays same)
// ---------------------------------------------------------------------------

describe('isRegression — no regressions (gate improves or stays same)', () => {
  it('fail → pass is not a regression', () => {
    expect(isRegression('pass', 'fail')).toBe(false);
  });

  it('warn → pass is not a regression', () => {
    expect(isRegression('pass', 'warn')).toBe(false);
  });

  it('fail → warn is not a regression', () => {
    expect(isRegression('warn', 'fail')).toBe(false);
  });

  it('pass → pass is not a regression', () => {
    expect(isRegression('pass', 'pass')).toBe(false);
  });

  it('warn → warn is not a regression', () => {
    expect(isRegression('warn', 'warn')).toBe(false);
  });

  it('fail → fail is not a regression', () => {
    expect(isRegression('fail', 'fail')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRegression — null handling
// ---------------------------------------------------------------------------

describe('isRegression — null handling', () => {
  it('null current → no regression', () => {
    expect(isRegression(null, 'pass')).toBe(false);
  });

  it('null current with warn → no regression', () => {
    expect(isRegression(null, 'warn')).toBe(false);
  });

  it('null current with fail → no regression', () => {
    expect(isRegression(null, 'fail')).toBe(false);
  });

  it('null previous → no regression', () => {
    expect(isRegression('pass', null)).toBe(false);
  });

  it('null previous with warn → no regression', () => {
    expect(isRegression('warn', null)).toBe(false);
  });

  it('null previous with fail → no regression', () => {
    expect(isRegression('fail', null)).toBe(false);
  });

  it('both null → no regression', () => {
    expect(isRegression(null, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue grouping logic — extracted from apps/ui/app/issues/page.tsx
// ---------------------------------------------------------------------------

interface IssueRow {
  issueId: string;
  runCount: number;
  lastGate: 'pass' | 'warn' | 'fail' | null;
  lastRun: string;
}

function groupRunsByIssue(runs: Run[]): IssueRow[] {
  const map = new Map<string, IssueRow>();

  for (const run of runs) {
    if (!map.has(run.issueId)) {
      map.set(run.issueId, {
        issueId: run.issueId,
        runCount: 1,
        lastGate: run.gateFinal,
        lastRun: run.startedAt,
      });
    } else {
      const row = map.get(run.issueId)!;
      row.runCount += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.lastRun < b.lastRun ? 1 : -1,
  );
}

function makeRun(
  overrides: Partial<Run> & { issueId: string; startedAt: string },
): Run {
  return {
    id: overrides.issueId + '-' + overrides.startedAt,
    issueId: overrides.issueId,
    startedAt: overrides.startedAt,
    finishedAt: null,
    status: 'done',
    totalTokens: 0,
    totalCostUsd: '0.000000',
    gateFinal: null,
    ...overrides,
  };
}

describe('groupRunsByIssue — single issue', () => {
  it('produces one row when all runs share the same issueId', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-02T00:00:00Z', gateFinal: 'pass' }),
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00Z', gateFinal: 'warn' }),
    ];
    const rows = groupRunsByIssue(runs);
    expect(rows).toHaveLength(1);
  });

  it('runCount equals the number of runs for the issue', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-03T00:00:00Z' }),
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-02T00:00:00Z' }),
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00Z' }),
    ];
    const rows = groupRunsByIssue(runs);
    expect(rows[0].runCount).toBe(3);
  });

  it('lastGate comes from the first run in the array (newest-first order)', () => {
    // API returns newest-first; first element is the most recent run
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-02T00:00:00Z', gateFinal: 'pass' }),
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00Z', gateFinal: 'fail' }),
    ];
    const rows = groupRunsByIssue(runs);
    expect(rows[0].lastGate).toBe('pass');
  });

  it('lastRun comes from the first run in the array (newest-first order)', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-02T00:00:00Z' }),
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00Z' }),
    ];
    const rows = groupRunsByIssue(runs);
    expect(rows[0].lastRun).toBe('2024-01-02T00:00:00Z');
  });
});

describe('groupRunsByIssue — multiple issues', () => {
  it('produces one row per distinct issueId', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00Z' }),
      makeRun({ issueId: 'MOB-2', startedAt: '2024-01-02T00:00:00Z' }),
      makeRun({ issueId: 'MOB-3', startedAt: '2024-01-03T00:00:00Z' }),
    ];
    const rows = groupRunsByIssue(runs);
    expect(rows).toHaveLength(3);
  });

  it('sorts issues descending by lastRun (most recent first)', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00Z' }),
      makeRun({ issueId: 'MOB-3', startedAt: '2024-01-03T00:00:00Z' }),
      makeRun({ issueId: 'MOB-2', startedAt: '2024-01-02T00:00:00Z' }),
    ];
    const rows = groupRunsByIssue(runs);
    expect(rows.map((r) => r.issueId)).toEqual(['MOB-3', 'MOB-2', 'MOB-1']);
  });

  it('counts runs independently per issue', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-03T00:00:00Z' }),
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-02T00:00:00Z' }),
      makeRun({ issueId: 'MOB-2', startedAt: '2024-01-01T00:00:00Z' }),
    ];
    const rows = groupRunsByIssue(runs);
    const mob1 = rows.find((r) => r.issueId === 'MOB-1')!;
    const mob2 = rows.find((r) => r.issueId === 'MOB-2')!;
    expect(mob1.runCount).toBe(2);
    expect(mob2.runCount).toBe(1);
  });

  it('each issue row has lastGate from its own first run in the input', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-02T00:00:00Z', gateFinal: 'pass' }),
      makeRun({ issueId: 'MOB-2', startedAt: '2024-01-01T00:00:00Z', gateFinal: 'fail' }),
    ];
    const rows = groupRunsByIssue(runs);
    const mob1 = rows.find((r) => r.issueId === 'MOB-1')!;
    const mob2 = rows.find((r) => r.issueId === 'MOB-2')!;
    expect(mob1.lastGate).toBe('pass');
    expect(mob2.lastGate).toBe('fail');
  });
});

describe('groupRunsByIssue — edge cases', () => {
  it('returns empty array when runs is empty', () => {
    expect(groupRunsByIssue([])).toEqual([]);
  });

  it('handles a single run correctly', () => {
    const runs = [makeRun({ issueId: 'MOB-42', startedAt: '2024-06-01T00:00:00Z', gateFinal: 'warn' })];
    const rows = groupRunsByIssue(runs);
    expect(rows).toHaveLength(1);
    expect(rows[0].issueId).toBe('MOB-42');
    expect(rows[0].runCount).toBe(1);
    expect(rows[0].lastGate).toBe('warn');
    expect(rows[0].lastRun).toBe('2024-06-01T00:00:00Z');
  });

  it('preserves null lastGate when the first run has no gate', () => {
    const runs = [
      makeRun({ issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00Z', gateFinal: null }),
    ];
    const rows = groupRunsByIssue(runs);
    expect(rows[0].lastGate).toBeNull();
  });
});
