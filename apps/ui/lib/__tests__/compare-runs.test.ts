/**
 * Unit tests for the compareRuns diff algorithm — MOB-1070
 *
 * The diff logic inside compareRuns is pure once the DB rows are in memory.
 * These tests replicate the exact same algorithm on in-memory fixtures so
 * no DB connection is required.
 *
 * Algorithm under test:
 *   - persistent = fingerprints present in ALL runs
 *   - new        = in newest run but NOT in oldest run (and not persistent)
 *   - resolved   = in oldest run but NOT in newest run (and not persistent)
 *   - crossProject = runs have different issue-ID prefixes (e.g. MOB vs ABC)
 *   - costDiff   = parseFloat(newest.total_cost) - parseFloat(oldest.total_cost)
 *   - durationDiff = newestDurationMs - oldestDurationMs (null if either is null)
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run apps/ui/lib/__tests__/compare-runs.test.ts --reporter=verbose
 */

import { describe, it, expect, beforeAll } from 'vitest';

// ---------------------------------------------------------------------------
// Types mirroring forja-store.ts (kept local so no DB import is needed)
// ---------------------------------------------------------------------------

type GateDecision = 'pass' | 'warn' | 'fail';
type Severity = 'critical' | 'high' | 'medium' | 'low';

interface FindingRow {
  run_id: string;
  fingerprint: string;
  severity: Severity;
  category: string;
  title: string;
  file_path: string | null;
  line: number | null;
}

interface RunRow {
  id: string;
  issue_id: string;
  started_at: string;
  finished_at: string | null;
  total_cost: string;
  gate: GateDecision | null;
}

interface ComparedFinding {
  fingerprint: string;
  severity: Severity;
  category: string;
  title: string;
  filePath: string | null;
  line: number | null;
}

interface RunMeta {
  id: string;
  issueId: string;
  startedAt: string;
  finishedAt: string | null;
  totalCost: string;
  gate: GateDecision | null;
  durationMs: number | null;
}

interface CompareResult {
  runs: RunMeta[];
  new: ComparedFinding[];
  resolved: ComparedFinding[];
  persistent: ComparedFinding[];
  crossProject: boolean;
  costDiff: number;
  durationDiff: number | null;
}

// ---------------------------------------------------------------------------
// Pure algorithm extracted from compareRuns (mirrors forja-store.ts exactly)
// ---------------------------------------------------------------------------

function toComparedFinding(fingerprint: string, row: FindingRow): ComparedFinding {
  return {
    fingerprint,
    severity: row.severity,
    category: row.category,
    title: row.title,
    filePath: row.file_path,
    line: row.line,
  };
}

/**
 * Runs the exact same diff algorithm as compareRuns() but on in-memory fixtures.
 * runRows must already be sorted by started_at ascending (oldest first).
 */
function runDiffAlgorithm(runRows: RunRow[], findingRows: FindingRow[]): CompareResult {
  const runs: RunMeta[] = runRows.map((r) => ({
    id: r.id,
    issueId: r.issue_id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    totalCost: r.total_cost,
    gate: r.gate,
    durationMs:
      r.finished_at
        ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()
        : null,
  }));

  // crossProject: runs belong to different issue prefixes
  const projectPrefixes = new Set(runs.map((r) => r.issueId.replace(/-\d+$/, '')));
  const crossProject = projectPrefixes.size > 1;

  // Group fingerprints by run (preserving insertion order = runRows order)
  const runOrder = runRows.map((r) => r.id);
  const fingerprintsByRun = new Map<string, Map<string, FindingRow>>();
  for (const runId of runOrder) {
    fingerprintsByRun.set(runId, new Map());
  }
  for (const row of findingRows) {
    fingerprintsByRun.get(row.run_id)?.set(row.fingerprint, row);
  }

  const oldestId = runOrder[0];
  const newestId = runOrder[runOrder.length - 1];
  const oldestMap = fingerprintsByRun.get(oldestId)!;
  const newestMap = fingerprintsByRun.get(newestId)!;

  // persistent = fingerprints present in ALL runs
  const allMaps = runOrder.map((id) => fingerprintsByRun.get(id)!);
  const persistentFps = new Set(
    Array.from(allMaps[0].keys()).filter((fp) => allMaps.every((m) => m.has(fp))),
  );

  const newFindings: ComparedFinding[] = [];
  const resolvedFindings: ComparedFinding[] = [];
  const persistentFindings: ComparedFinding[] = [];

  // new: in newest but not in oldest (and not persistent)
  Array.from(newestMap).forEach(([fp, row]) => {
    if (persistentFps.has(fp)) {
      persistentFindings.push(toComparedFinding(fp, row));
    } else if (!oldestMap.has(fp)) {
      newFindings.push(toComparedFinding(fp, row));
    }
  });

  // resolved: in oldest but not in newest (and not persistent)
  Array.from(oldestMap).forEach(([fp, row]) => {
    if (!newestMap.has(fp) && !persistentFps.has(fp)) {
      resolvedFindings.push(toComparedFinding(fp, row));
    }
  });

  // costDiff: newest - oldest
  const oldestCost = parseFloat(runRows[0].total_cost ?? '0');
  const newestCost = parseFloat(runRows[runRows.length - 1].total_cost ?? '0');
  const costDiff = newestCost - oldestCost;

  // durationDiff: newest duration - oldest duration
  const oldestRun = runs[0];
  const newestRun = runs[runs.length - 1];
  const durationDiff =
    oldestRun.durationMs !== null && newestRun.durationMs !== null
      ? newestRun.durationMs - oldestRun.durationMs
      : null;

  return {
    runs,
    new: newFindings,
    resolved: resolvedFindings,
    persistent: persistentFindings,
    crossProject,
    costDiff,
    durationDiff,
  };
}

// ---------------------------------------------------------------------------
// Fixtures helpers
// ---------------------------------------------------------------------------

function makeRunRow(overrides: Partial<RunRow> & { id: string; issue_id: string }): RunRow {
  return {
    started_at: '2025-04-01T10:00:00Z',
    finished_at: '2025-04-01T10:30:00Z',
    total_cost: '0.10',
    gate: null,
    ...overrides,
  };
}

function makeFindingRow(
  run_id: string,
  fingerprint: string,
  overrides: Partial<FindingRow> = {},
): FindingRow {
  return {
    run_id,
    fingerprint,
    severity: 'high',
    category: 'security',
    title: `Finding ${fingerprint}`,
    file_path: null,
    line: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compareRuns diff algorithm — happy path (2 runs, mixed findings)', () => {
  const runA = makeRunRow({ id: 'run-a', issue_id: 'MOB-100', started_at: '2025-04-01T10:00:00Z', finished_at: '2025-04-01T10:30:00Z', total_cost: '0.10' });
  const runB = makeRunRow({ id: 'run-b', issue_id: 'MOB-101', started_at: '2025-04-02T10:00:00Z', finished_at: '2025-04-02T11:00:00Z', total_cost: '0.20' });

  // fp-shared is in both → persistent
  // fp-old is only in run-a (oldest) → resolved
  // fp-new is only in run-b (newest) → new
  const findings: FindingRow[] = [
    makeFindingRow('run-a', 'fp-shared', { severity: 'critical', category: 'xss', title: 'Shared XSS' }),
    makeFindingRow('run-a', 'fp-old',    { severity: 'high',     category: 'sqli', title: 'Old SQLi' }),
    makeFindingRow('run-b', 'fp-shared', { severity: 'critical', category: 'xss',  title: 'Shared XSS' }),
    makeFindingRow('run-b', 'fp-new',    { severity: 'medium',   category: 'csrf', title: 'New CSRF' }),
  ];

  let result: CompareResult;
  beforeAll(() => {
    result = runDiffAlgorithm([runA, runB], findings);
  });

  it('classifies fp-shared as persistent', () => {
    expect(result.persistent).toHaveLength(1);
    expect(result.persistent[0].fingerprint).toBe('fp-shared');
  });

  it('classifies fp-old as resolved', () => {
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].fingerprint).toBe('fp-old');
  });

  it('classifies fp-new as new', () => {
    expect(result.new).toHaveLength(1);
    expect(result.new[0].fingerprint).toBe('fp-new');
  });

  it('preserves severity on persistent finding', () => {
    expect(result.persistent[0].severity).toBe('critical');
  });

  it('preserves category on resolved finding', () => {
    expect(result.resolved[0].category).toBe('sqli');
  });
});

describe('compareRuns diff algorithm — crossProject detection', () => {
  it('crossProject is false when all runs share the same issue prefix', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-100', started_at: '2025-04-01T10:00:00Z' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-200', started_at: '2025-04-02T10:00:00Z' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.crossProject).toBe(false);
  });

  it('crossProject is true when runs have different issue prefixes', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-100', started_at: '2025-04-01T10:00:00Z' }),
      makeRunRow({ id: 'r2', issue_id: 'ABC-001', started_at: '2025-04-02T10:00:00Z' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.crossProject).toBe(true);
  });

  it('crossProject is false for a single run (only one prefix)', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-100', started_at: '2025-04-01T10:00:00Z' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.crossProject).toBe(false);
  });

  it('crossProject is true across 3 runs with mixed prefixes', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-100', started_at: '2025-04-01T10:00:00Z' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-200', started_at: '2025-04-02T10:00:00Z' }),
      makeRunRow({ id: 'r3', issue_id: 'XYZ-999', started_at: '2025-04-03T10:00:00Z' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.crossProject).toBe(true);
  });
});

describe('compareRuns diff algorithm — costDiff calculation', () => {
  it('costDiff = newest totalCost minus oldest totalCost (positive when newer costs more)', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z', total_cost: '0.05' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z', total_cost: '0.15' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.costDiff).toBeCloseTo(0.10, 5);
  });

  it('costDiff is negative when newest costs less than oldest', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z', total_cost: '0.50' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z', total_cost: '0.20' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.costDiff).toBeCloseTo(-0.30, 5);
  });

  it('costDiff is 0 when both runs have equal cost', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z', total_cost: '0.10' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z', total_cost: '0.10' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.costDiff).toBe(0);
  });

  it('costDiff between oldest and newest when 3 runs provided (ignores middle)', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z', total_cost: '0.10' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z', total_cost: '0.99' }),
      makeRunRow({ id: 'r3', issue_id: 'MOB-3', started_at: '2025-04-03T10:00:00Z', total_cost: '0.30' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    // newest(r3)=0.30, oldest(r1)=0.10 → diff=0.20 (middle run r2 is ignored)
    expect(result.costDiff).toBeCloseTo(0.20, 5);
  });
});

describe('compareRuns diff algorithm — boundary: all findings shared (all persistent)', () => {
  it('produces only persistent findings when all fingerprints appear in both runs', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z' }),
    ];
    const findings = [
      makeFindingRow('r1', 'fp-alpha'),
      makeFindingRow('r1', 'fp-beta'),
      makeFindingRow('r2', 'fp-alpha'),
      makeFindingRow('r2', 'fp-beta'),
    ];
    const result = runDiffAlgorithm(runs, findings);
    expect(result.persistent).toHaveLength(2);
    expect(result.new).toHaveLength(0);
    expect(result.resolved).toHaveLength(0);
  });
});

describe('compareRuns diff algorithm — boundary: no shared findings', () => {
  it('produces only new and resolved when no fingerprints are shared between oldest and newest', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z' }),
    ];
    const findings = [
      makeFindingRow('r1', 'fp-old-only'),
      makeFindingRow('r2', 'fp-new-only'),
    ];
    const result = runDiffAlgorithm(runs, findings);
    expect(result.persistent).toHaveLength(0);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].fingerprint).toBe('fp-old-only');
    expect(result.new).toHaveLength(1);
    expect(result.new[0].fingerprint).toBe('fp-new-only');
  });

  it('produces empty results when both runs have zero findings', () => {
    const runs = [
      makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z' }),
      makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z' }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.new).toHaveLength(0);
    expect(result.resolved).toHaveLength(0);
    expect(result.persistent).toHaveLength(0);
  });
});

describe('compareRuns diff algorithm — 3+ runs: persistent requires presence in ALL runs', () => {
  // run-a: fp-shared, fp-only-a
  // run-b: fp-shared, fp-only-b
  // run-c: fp-shared, fp-only-c
  // fp-shared is in all 3 → persistent
  // fp-only-a is in oldest but not newest → resolved
  // fp-only-c is in newest but not oldest → new
  // fp-only-b is in a middle run only → neither new nor resolved nor persistent (ignored)
  const runA = makeRunRow({ id: 'r-a', issue_id: 'MOB-1', started_at: '2025-04-01T10:00:00Z' });
  const runB = makeRunRow({ id: 'r-b', issue_id: 'MOB-2', started_at: '2025-04-02T10:00:00Z' });
  const runC = makeRunRow({ id: 'r-c', issue_id: 'MOB-3', started_at: '2025-04-03T10:00:00Z' });

  const findings: FindingRow[] = [
    makeFindingRow('r-a', 'fp-shared'),
    makeFindingRow('r-a', 'fp-only-a'),
    makeFindingRow('r-b', 'fp-shared'),
    makeFindingRow('r-b', 'fp-only-b'),
    makeFindingRow('r-c', 'fp-shared'),
    makeFindingRow('r-c', 'fp-only-c'),
  ];

  let result: CompareResult;
  beforeAll(() => {
    result = runDiffAlgorithm([runA, runB, runC], findings);
  });

  it('fp-shared (in all 3 runs) is classified as persistent', () => {
    expect(result.persistent).toHaveLength(1);
    expect(result.persistent[0].fingerprint).toBe('fp-shared');
  });

  it('fp-only-a (oldest only) is classified as resolved', () => {
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].fingerprint).toBe('fp-only-a');
  });

  it('fp-only-c (newest only) is classified as new', () => {
    expect(result.new).toHaveLength(1);
    expect(result.new[0].fingerprint).toBe('fp-only-c');
  });

  it('fp-only-b (middle run only) does not appear in any category', () => {
    const allFps = [
      ...result.persistent.map((f) => f.fingerprint),
      ...result.resolved.map((f) => f.fingerprint),
      ...result.new.map((f) => f.fingerprint),
    ];
    expect(allFps).not.toContain('fp-only-b');
  });

  it('5-run scenario: persistent requires fingerprint in ALL 5 runs', () => {
    const run1 = makeRunRow({ id: 'r1', issue_id: 'MOB-1', started_at: '2025-04-01T00:00:00Z' });
    const run2 = makeRunRow({ id: 'r2', issue_id: 'MOB-2', started_at: '2025-04-02T00:00:00Z' });
    const run3 = makeRunRow({ id: 'r3', issue_id: 'MOB-3', started_at: '2025-04-03T00:00:00Z' });
    const run4 = makeRunRow({ id: 'r4', issue_id: 'MOB-4', started_at: '2025-04-04T00:00:00Z' });
    const run5 = makeRunRow({ id: 'r5', issue_id: 'MOB-5', started_at: '2025-04-05T00:00:00Z' });

    // fp-all5 is in every run
    // fp-in-4 is in runs 1-4 but NOT in run 5 (newest) → resolved
    const fiveFindings: FindingRow[] = [
      makeFindingRow('r1', 'fp-all5'), makeFindingRow('r1', 'fp-in-4'),
      makeFindingRow('r2', 'fp-all5'), makeFindingRow('r2', 'fp-in-4'),
      makeFindingRow('r3', 'fp-all5'), makeFindingRow('r3', 'fp-in-4'),
      makeFindingRow('r4', 'fp-all5'), makeFindingRow('r4', 'fp-in-4'),
      makeFindingRow('r5', 'fp-all5'),
    ];

    const r5 = runDiffAlgorithm([run1, run2, run3, run4, run5], fiveFindings);
    expect(r5.persistent).toHaveLength(1);
    expect(r5.persistent[0].fingerprint).toBe('fp-all5');
    // fp-in-4 is in oldest (r1) but not newest (r5) → resolved
    expect(r5.resolved).toHaveLength(1);
    expect(r5.resolved[0].fingerprint).toBe('fp-in-4');
  });
});

describe('compareRuns diff algorithm — durationDiff calculation', () => {
  it('durationDiff = newestDurationMs - oldestDurationMs (positive when newer takes longer)', () => {
    // oldest: 30 min = 1_800_000 ms
    // newest: 60 min = 3_600_000 ms → diff = 1_800_000 ms
    const runs = [
      makeRunRow({
        id: 'r1', issue_id: 'MOB-1',
        started_at: '2025-04-01T10:00:00Z',
        finished_at: '2025-04-01T10:30:00Z',
        total_cost: '0.10',
      }),
      makeRunRow({
        id: 'r2', issue_id: 'MOB-2',
        started_at: '2025-04-02T10:00:00Z',
        finished_at: '2025-04-02T11:00:00Z',
        total_cost: '0.10',
      }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.durationDiff).toBe(1_800_000);
  });

  it('durationDiff is null when oldest run has no finishedAt', () => {
    const runs = [
      makeRunRow({
        id: 'r1', issue_id: 'MOB-1',
        started_at: '2025-04-01T10:00:00Z',
        finished_at: null,
        total_cost: '0.10',
      }),
      makeRunRow({
        id: 'r2', issue_id: 'MOB-2',
        started_at: '2025-04-02T10:00:00Z',
        finished_at: '2025-04-02T11:00:00Z',
        total_cost: '0.10',
      }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.durationDiff).toBeNull();
  });

  it('durationDiff is null when newest run has no finishedAt', () => {
    const runs = [
      makeRunRow({
        id: 'r1', issue_id: 'MOB-1',
        started_at: '2025-04-01T10:00:00Z',
        finished_at: '2025-04-01T10:30:00Z',
        total_cost: '0.10',
      }),
      makeRunRow({
        id: 'r2', issue_id: 'MOB-2',
        started_at: '2025-04-02T10:00:00Z',
        finished_at: null,
        total_cost: '0.10',
      }),
    ];
    const result = runDiffAlgorithm(runs, []);
    expect(result.durationDiff).toBeNull();
  });
});
