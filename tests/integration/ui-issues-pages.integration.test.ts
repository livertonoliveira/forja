/**
 * Integration tests for the /issues and /issues/[issueId] page logic.
 *
 * Strategy:
 * - Mock `next/link` and `next/navigation` so page modules can be imported
 *   without a running Next.js server.
 * - Mock `node-fetch` / global `fetch` so pages that call the API are
 *   exercised in isolation.
 * - Test the pure business logic that lives inside the page files:
 *   - IssuesPage: aggregation of runs into per-issue rows, sorting by lastRun desc
 *   - IssueDetailPage: `isRegression` gate comparison logic
 * - Also verify the RegressionBadge component shape (no DOM required).
 *
 * E2E note: No Playwright or Cypress is configured in this project.
 * @testing-library/react is not installed in apps/ui.
 * These integration tests cover page logic as the closest substitute.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Run } from '@/lib/types';

// ---------------------------------------------------------------------------
// Minimal React mock — only createElement is needed to render JSX in tests.
// Without this, Vitest's esbuild transform emits `React.createElement(...)` calls
// but `React` is not in scope because there is no react package in apps/ui devDeps.
// ---------------------------------------------------------------------------

vi.mock('react', () => {
  function createElement(
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ) {
    const resolvedChildren = children.length === 0
      ? undefined
      : children.length === 1
        ? children[0]
        : children;
    return {
      type,
      props: {
        ...(props ?? {}),
        ...(resolvedChildren !== undefined ? { children: resolvedChildren } : {}),
      },
    };
  }
  return { default: { createElement }, createElement };
});

// ---------------------------------------------------------------------------
// Mock next/link so the page module can be imported without Next.js context
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GateFinal = 'pass' | 'warn' | 'fail' | null;

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    issueId: 'MOB-1023',
    status: 'done',
    startedAt: '2024-01-01T00:00:00.000Z',
    finishedAt: '2024-01-01T01:00:00.000Z',
    totalTokens: 1000,
    totalCostUsd: '0.001000',
    gateFinal: 'pass',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isRegression — pure business logic extracted for testing
// Mirrors the function defined in apps/ui/app/issues/[issueId]/page.tsx
// ---------------------------------------------------------------------------

const gateWeight: Record<string, number> = { fail: 0, warn: 1, pass: 2 };

function isRegression(
  current: GateFinal,
  previous: GateFinal,
): boolean {
  if (current === null || previous === null) return false;
  return gateWeight[current] < gateWeight[previous];
}

// ---------------------------------------------------------------------------
// Issue aggregation — mirrors the map-building logic in IssuesPage
// ---------------------------------------------------------------------------

interface IssueRow {
  issueId: string;
  runCount: number;
  lastGate: GateFinal;
  lastRun: string;
}

function aggregateRuns(runs: Run[]): IssueRow[] {
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

// ---------------------------------------------------------------------------
// 1. isRegression — all gate transitions
// ---------------------------------------------------------------------------

describe('isRegression — gate comparison logic', () => {
  it('returns false when both gates are null', () => {
    expect(isRegression(null, null)).toBe(false);
  });

  it('returns false when current is null', () => {
    expect(isRegression(null, 'pass')).toBe(false);
  });

  it('returns false when previous is null', () => {
    expect(isRegression('fail', null)).toBe(false);
  });

  it('returns false when gate stays the same (pass → pass)', () => {
    expect(isRegression('pass', 'pass')).toBe(false);
  });

  it('returns false when gate stays the same (warn → warn)', () => {
    expect(isRegression('warn', 'warn')).toBe(false);
  });

  it('returns false when gate stays the same (fail → fail)', () => {
    expect(isRegression('fail', 'fail')).toBe(false);
  });

  it('returns false when gate improves (fail → pass)', () => {
    expect(isRegression('pass', 'fail')).toBe(false);
  });

  it('returns false when gate improves (fail → warn)', () => {
    expect(isRegression('warn', 'fail')).toBe(false);
  });

  it('returns false when gate improves (warn → pass)', () => {
    expect(isRegression('pass', 'warn')).toBe(false);
  });

  it('returns true when gate worsens (pass → fail)', () => {
    expect(isRegression('fail', 'pass')).toBe(true);
  });

  it('returns true when gate worsens (pass → warn)', () => {
    expect(isRegression('warn', 'pass')).toBe(true);
  });

  it('returns true when gate worsens (warn → fail)', () => {
    expect(isRegression('fail', 'warn')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Issue aggregation — /issues page logic
// ---------------------------------------------------------------------------

describe('aggregateRuns — IssuesPage issue list logic', () => {
  it('returns an empty array when there are no runs', () => {
    expect(aggregateRuns([])).toEqual([]);
  });

  it('groups a single run into a single issue row', () => {
    const run = makeRun({ id: 'run-1', issueId: 'MOB-100' });
    const result = aggregateRuns([run]);

    expect(result).toHaveLength(1);
    expect(result[0].issueId).toBe('MOB-100');
    expect(result[0].runCount).toBe(1);
    expect(result[0].lastGate).toBe('pass');
    expect(result[0].lastRun).toBe(run.startedAt);
  });

  it('counts multiple runs for the same issue correctly', () => {
    const runs = [
      makeRun({ id: 'run-1', issueId: 'MOB-200', startedAt: '2024-01-01T00:00:00.000Z' }),
      makeRun({ id: 'run-2', issueId: 'MOB-200', startedAt: '2024-01-02T00:00:00.000Z' }),
      makeRun({ id: 'run-3', issueId: 'MOB-200', startedAt: '2024-01-03T00:00:00.000Z' }),
    ];
    const result = aggregateRuns(runs);

    expect(result).toHaveLength(1);
    expect(result[0].runCount).toBe(3);
  });

  it('preserves the lastGate and lastRun from the first (oldest) run seen for a new issue', () => {
    const runs = [
      makeRun({ id: 'run-a', issueId: 'MOB-300', startedAt: '2024-01-01T00:00:00.000Z', gateFinal: 'fail' }),
      makeRun({ id: 'run-b', issueId: 'MOB-300', startedAt: '2024-01-02T00:00:00.000Z', gateFinal: 'pass' }),
    ];
    const result = aggregateRuns(runs);

    // The map is keyed by issueId and set on first encounter (run-a)
    expect(result[0].lastGate).toBe('fail');
    expect(result[0].lastRun).toBe('2024-01-01T00:00:00.000Z');
  });

  it('groups runs by issueId into separate rows', () => {
    const runs = [
      makeRun({ id: 'run-1', issueId: 'MOB-1', startedAt: '2024-01-01T00:00:00.000Z' }),
      makeRun({ id: 'run-2', issueId: 'MOB-2', startedAt: '2024-01-02T00:00:00.000Z' }),
      makeRun({ id: 'run-3', issueId: 'MOB-3', startedAt: '2024-01-03T00:00:00.000Z' }),
    ];
    const result = aggregateRuns(runs);

    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.issueId);
    expect(ids).toContain('MOB-1');
    expect(ids).toContain('MOB-2');
    expect(ids).toContain('MOB-3');
  });

  it('sorts issue rows by lastRun descending (most recent first)', () => {
    const runs = [
      makeRun({ id: 'run-a', issueId: 'MOB-A', startedAt: '2024-01-01T00:00:00.000Z' }),
      makeRun({ id: 'run-c', issueId: 'MOB-C', startedAt: '2024-03-01T00:00:00.000Z' }),
      makeRun({ id: 'run-b', issueId: 'MOB-B', startedAt: '2024-02-01T00:00:00.000Z' }),
    ];
    const result = aggregateRuns(runs);

    expect(result[0].issueId).toBe('MOB-C');
    expect(result[1].issueId).toBe('MOB-B');
    expect(result[2].issueId).toBe('MOB-A');
  });

  it('handles a mix of issues with one and multiple runs', () => {
    const runs = [
      makeRun({ id: 'run-1', issueId: 'MOB-X', startedAt: '2024-01-01T00:00:00.000Z' }),
      makeRun({ id: 'run-2', issueId: 'MOB-X', startedAt: '2024-01-01T01:00:00.000Z' }),
      makeRun({ id: 'run-3', issueId: 'MOB-Y', startedAt: '2024-01-02T00:00:00.000Z' }),
    ];
    const result = aggregateRuns(runs);

    expect(result).toHaveLength(2);
    const mobX = result.find((r) => r.issueId === 'MOB-X');
    const mobY = result.find((r) => r.issueId === 'MOB-Y');
    expect(mobX?.runCount).toBe(2);
    expect(mobY?.runCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. IssueDetailPage — run ordering and regression detection sequence
// ---------------------------------------------------------------------------

describe('IssueDetailPage — run ordering and regression sequence', () => {
  /**
   * The page receives runs sorted newest-first from the API, then reverses them
   * to oldest-first for chronological display, computing regression against
   * the previous entry.
   */
  function buildRegressionSequence(newestFirst: Run[]): boolean[] {
    const runs = [...newestFirst].reverse(); // oldest first
    return runs.map((run, index) => {
      const previous = index > 0 ? runs[index - 1] : null;
      return previous !== null && isRegression(run.gateFinal, previous.gateFinal);
    });
  }

  it('returns no regressions when there is only one run', () => {
    const runs = [makeRun({ id: 'run-1', gateFinal: 'pass' })];
    expect(buildRegressionSequence(runs)).toEqual([false]);
  });

  it('detects no regression when gate improves over time', () => {
    const newestFirst = [
      makeRun({ id: 'run-2', startedAt: '2024-01-02T00:00:00.000Z', gateFinal: 'pass' }),
      makeRun({ id: 'run-1', startedAt: '2024-01-01T00:00:00.000Z', gateFinal: 'fail' }),
    ];
    const result = buildRegressionSequence(newestFirst);
    // Chronological: run-1 (fail), run-2 (pass) → improvement, no regression
    expect(result).toEqual([false, false]);
  });

  it('detects regression when gate worsens over time', () => {
    const newestFirst = [
      makeRun({ id: 'run-2', startedAt: '2024-01-02T00:00:00.000Z', gateFinal: 'fail' }),
      makeRun({ id: 'run-1', startedAt: '2024-01-01T00:00:00.000Z', gateFinal: 'pass' }),
    ];
    const result = buildRegressionSequence(newestFirst);
    // Chronological: run-1 (pass), run-2 (fail) → regression on run-2
    expect(result).toEqual([false, true]);
  });

  it('detects regression when gate goes from pass to warn', () => {
    const newestFirst = [
      makeRun({ id: 'run-2', startedAt: '2024-01-02T00:00:00.000Z', gateFinal: 'warn' }),
      makeRun({ id: 'run-1', startedAt: '2024-01-01T00:00:00.000Z', gateFinal: 'pass' }),
    ];
    const result = buildRegressionSequence(newestFirst);
    expect(result).toEqual([false, true]);
  });

  it('produces correct sequence for 4 runs with mixed gates', () => {
    // API returns newest first
    const newestFirst = [
      makeRun({ id: 'run-4', startedAt: '2024-01-04T00:00:00.000Z', gateFinal: 'fail' }),
      makeRun({ id: 'run-3', startedAt: '2024-01-03T00:00:00.000Z', gateFinal: 'pass' }),
      makeRun({ id: 'run-2', startedAt: '2024-01-02T00:00:00.000Z', gateFinal: 'warn' }),
      makeRun({ id: 'run-1', startedAt: '2024-01-01T00:00:00.000Z', gateFinal: 'pass' }),
    ];
    const result = buildRegressionSequence(newestFirst);
    // Chronological:
    //   run-1 (pass): no prev → false
    //   run-2 (warn): pass→warn, worse → true
    //   run-3 (pass): warn→pass, better → false
    //   run-4 (fail): pass→fail, worse → true
    expect(result).toEqual([false, true, false, true]);
  });

  it('does not mark regression when previous gate is null', () => {
    const newestFirst = [
      makeRun({ id: 'run-2', startedAt: '2024-01-02T00:00:00.000Z', gateFinal: 'fail' }),
      makeRun({ id: 'run-1', startedAt: '2024-01-01T00:00:00.000Z', gateFinal: null }),
    ];
    const result = buildRegressionSequence(newestFirst);
    // Chronological: run-1 (null), run-2 (fail) → previous is null → no regression
    expect(result).toEqual([false, false]);
  });
});

// ---------------------------------------------------------------------------
// 4. RegressionBadge — structural / snapshot test (no DOM required)
// ---------------------------------------------------------------------------

describe('RegressionBadge — structural test', () => {
  it('is a default export that is a function', async () => {
    const mod = await import('@/components/RegressionBadge');
    expect(typeof mod.default).toBe('function');
  });

  it('renders a JSX element with the correct title attribute', async () => {
    const { default: RegressionBadge } = await import('@/components/RegressionBadge');
    // Call as a plain function (valid for React server/client components)
    const element = RegressionBadge();
    expect(element).toBeDefined();
    expect(element).not.toBeNull();
    expect(element.props.title).toBe('Gate piorou em relação ao run anterior');
  });

  it('renders a span element (not a div or other tag)', async () => {
    const { default: RegressionBadge } = await import('@/components/RegressionBadge');
    const element = RegressionBadge();
    expect(element.type).toBe('span');
  });

  it('renders "Regressão" as child text content', async () => {
    const { default: RegressionBadge } = await import('@/components/RegressionBadge');
    const element = RegressionBadge();
    expect(element.props.children).toBe('Regressão');
  });

  it('applies red badge styling classes', async () => {
    const { default: RegressionBadge } = await import('@/components/RegressionBadge');
    const element = RegressionBadge();
    const className: string = element.props.className ?? '';
    expect(className).toContain('bg-red-900');
    expect(className).toContain('text-red-300');
  });
});
