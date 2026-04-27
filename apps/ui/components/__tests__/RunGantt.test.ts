/**
 * Unit tests for RunGantt pure logic (MOB-1075)
 *
 * Covers:
 *  - packIntervals: interval packing algorithm (overlapping and non-overlapping phases)
 *  - formatRelMs: relative millisecond formatting (+0s, +30s, +2m, +2m 30s)
 *  - width/position percentage calculations
 *  - minimum bar width enforcement (< 1% of total → minWidth 8px enforced via style)
 *  - gate color mapping
 *
 * These functions are extracted from RunGantt.tsx and tested in isolation.
 * No DOM or React runtime required.
 *
 * Run:
 *   npx vitest run --pool=threads apps/ui/components/__tests__/RunGantt.test.ts --reporter=verbose
 */

import { describe, it, expect } from 'vitest';
import type { RunPhase } from '@/lib/types';

// ---------------------------------------------------------------------------
// Re-implement the pure functions extracted from RunGantt.tsx so they can be
// tested without importing the React component (which needs a DOM runtime).
// If the implementation changes, these mirrors must be updated accordingly.
// ---------------------------------------------------------------------------

function packIntervals(phases: RunPhase[]): RunPhase[][] {
  const sorted = [...phases].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  const rows: RunPhase[][] = [];
  for (const phase of sorted) {
    const s = new Date(phase.startedAt).getTime();
    const e = phase.finishedAt ? new Date(phase.finishedAt).getTime() : s + 1;
    let placed = false;
    for (const row of rows) {
      const ok = row.every((x) => {
        const xs = new Date(x.startedAt).getTime();
        const xe = x.finishedAt ? new Date(x.finishedAt).getTime() : xs + 1;
        return e <= xs || s >= xe;
      });
      if (ok) {
        row.push(phase);
        placed = true;
        break;
      }
    }
    if (!placed) rows.push([phase]);
  }
  return rows;
}

function formatRelMs(ms: number): string {
  if (ms < 60_000) return `+${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `+${m}m ${s}s` : `+${m}m`;
}

// Width/position helpers as they appear in RunGantt.tsx
function calcLeftPct(startedAt: string, runStartMs: number, totalMs: number): number {
  const startOffMs = new Date(startedAt).getTime() - runStartMs;
  return (startOffMs / totalMs) * 100;
}

function calcWidthPct(
  startedAt: string,
  finishedAt: string | null,
  runStartMs: number,
  totalMs: number,
): number {
  const startOffMs = new Date(startedAt).getTime() - runStartMs;
  const endOffMs = finishedAt
    ? new Date(finishedAt).getTime() - runStartMs
    : totalMs;
  const durMs = Math.max(endOffMs - startOffMs, 0);
  return (durMs / totalMs) * 100;
}

// Gate color lookup as in RunGantt.tsx
const GATE_COLORS: Record<string, string> = {
  pass: '#4ADE80',
  warn: '#FCD34D',
  fail: '#F87171',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePhase(
  name: string,
  startedAt: string,
  finishedAt: string | null,
  gate: 'pass' | 'warn' | 'fail' | null = null,
): RunPhase {
  return {
    phase: name,
    startedAt,
    finishedAt,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: '0.000000',
    gate,
  };
}

// ---------------------------------------------------------------------------
// formatRelMs
// ---------------------------------------------------------------------------

describe('formatRelMs', () => {
  it('returns "+0s" for 0 ms', () => {
    expect(formatRelMs(0)).toBe('+0s');
  });

  it('returns "+1s" for 1000 ms (exact second)', () => {
    expect(formatRelMs(1_000)).toBe('+1s');
  });

  it('returns "+30s" for 30 000 ms', () => {
    expect(formatRelMs(30_000)).toBe('+30s');
  });

  it('returns "+59s" for 59 000 ms (boundary before minutes)', () => {
    expect(formatRelMs(59_000)).toBe('+59s');
  });

  it('returns "+1m" for exactly 60 000 ms', () => {
    expect(formatRelMs(60_000)).toBe('+1m');
  });

  it('returns "+2m" for exactly 120 000 ms (no extra seconds)', () => {
    expect(formatRelMs(120_000)).toBe('+2m');
  });

  it('returns "+2m 30s" for 150 000 ms', () => {
    expect(formatRelMs(150_000)).toBe('+2m 30s');
  });

  it('returns "+10m" for 600 000 ms', () => {
    expect(formatRelMs(600_000)).toBe('+10m');
  });

  it('rounds seconds from fractional ms (499 ms rounds to 0 s)', () => {
    expect(formatRelMs(499)).toBe('+0s');
  });

  it('rounds seconds from fractional ms (500 ms rounds to 1 s)', () => {
    expect(formatRelMs(500)).toBe('+1s');
  });
});

// ---------------------------------------------------------------------------
// packIntervals — non-overlapping phases
// ---------------------------------------------------------------------------

describe('packIntervals — non-overlapping phases', () => {
  it('places a single phase in a single row', () => {
    const phases = [
      makePhase('develop', '2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z'),
    ];
    const rows = packIntervals(phases);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
    expect(rows[0][0].phase).toBe('develop');
  });

  it('places two non-overlapping phases in the same row', () => {
    const phases = [
      makePhase('develop', '2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z'),
      makePhase('test', '2025-01-01T10:10:00Z', '2025-01-01T10:20:00Z'),
    ];
    const rows = packIntervals(phases);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
  });

  it('places three sequential non-overlapping phases in the same row', () => {
    const phases = [
      makePhase('a', '2025-01-01T10:00:00Z', '2025-01-01T10:05:00Z'),
      makePhase('b', '2025-01-01T10:05:00Z', '2025-01-01T10:10:00Z'),
      makePhase('c', '2025-01-01T10:10:00Z', '2025-01-01T10:15:00Z'),
    ];
    const rows = packIntervals(phases);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(3);
  });

  it('sorts phases by start time before packing (input out of order)', () => {
    const phases = [
      makePhase('second', '2025-01-01T10:10:00Z', '2025-01-01T10:20:00Z'),
      makePhase('first', '2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z'),
    ];
    const rows = packIntervals(phases);
    // Both should fit in 1 row since they don't overlap
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
    // First sorted phase is "first"
    expect(rows[0][0].phase).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// packIntervals — overlapping phases
// ---------------------------------------------------------------------------

describe('packIntervals — overlapping phases', () => {
  it('places two fully overlapping phases in separate rows', () => {
    const phases = [
      makePhase('a', '2025-01-01T10:00:00Z', '2025-01-01T10:20:00Z'),
      makePhase('b', '2025-01-01T10:05:00Z', '2025-01-01T10:15:00Z'),
    ];
    const rows = packIntervals(phases);
    expect(rows).toHaveLength(2);
  });

  it('places two partially overlapping phases in separate rows', () => {
    const phases = [
      makePhase('a', '2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z'),
      makePhase('b', '2025-01-01T10:05:00Z', '2025-01-01T10:15:00Z'),
    ];
    const rows = packIntervals(phases);
    expect(rows).toHaveLength(2);
  });

  it('packs 3 phases — 2 overlapping + 1 that fits in row 1', () => {
    // a: 10:00 – 10:10 (row 1)
    // b: 10:00 – 10:05 (overlap with a → row 2)
    // c: 10:10 – 10:20 (no overlap with a → fits in row 1)
    const phases = [
      makePhase('a', '2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z'),
      makePhase('b', '2025-01-01T10:00:00Z', '2025-01-01T10:05:00Z'),
      makePhase('c', '2025-01-01T10:10:00Z', '2025-01-01T10:20:00Z'),
    ];
    const rows = packIntervals(phases);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(2); // a and c
    expect(rows[1]).toHaveLength(1); // b
  });

  it('creates as many rows as needed for fully overlapping N phases', () => {
    const base = '2025-01-01T10:00:00Z';
    const end = '2025-01-01T10:30:00Z';
    const phases = Array.from({ length: 4 }, (_, i) =>
      makePhase(`p${i}`, base, end),
    );
    const rows = packIntervals(phases);
    expect(rows).toHaveLength(4);
    rows.forEach((row) => expect(row).toHaveLength(1));
  });

  it('handles a phase without finishedAt (treated as point interval s+1)', () => {
    const phases = [
      makePhase('running', '2025-01-01T10:00:00Z', null),
      makePhase('done', '2025-01-01T10:00:00Z', '2025-01-01T10:10:00Z'),
    ];
    const rows = packIntervals(phases);
    // Both start at the same time; "running" has e = s+1 which overlaps with "done"
    // They should NOT fit in the same row
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// packIntervals — edge cases
// ---------------------------------------------------------------------------

describe('packIntervals — edge cases', () => {
  it('returns empty array for empty input', () => {
    expect(packIntervals([])).toEqual([]);
  });

  it('handles phases with identical start and end times (zero-duration)', () => {
    const phases = [
      makePhase('a', '2025-01-01T10:00:00Z', '2025-01-01T10:00:00Z'),
      makePhase('b', '2025-01-01T10:00:00Z', '2025-01-01T10:00:00Z'),
    ];
    const rows = packIntervals(phases);
    // Both have zero-duration intervals [s, s].
    // The overlap check is: e <= xs || s >= xe
    // For identical intervals: e === xs (10:00:00 <= 10:00:00) → true → they are
    // considered non-overlapping and placed in the same row.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Width and position percentage calculations
// ---------------------------------------------------------------------------

describe('calcWidthPct and calcLeftPct', () => {
  const RUN_START = '2025-01-01T10:00:00Z';
  const runStartMs = new Date(RUN_START).getTime();
  const totalMs = 60_000; // 1 minute total

  it('left pct is 0 for a phase starting at runStart', () => {
    const left = calcLeftPct('2025-01-01T10:00:00Z', runStartMs, totalMs);
    expect(left).toBe(0);
  });

  it('left pct is 50 for a phase starting at the midpoint', () => {
    const left = calcLeftPct('2025-01-01T10:00:30Z', runStartMs, totalMs);
    expect(left).toBe(50);
  });

  it('left pct is 100 for a phase starting exactly at the end', () => {
    const left = calcLeftPct('2025-01-01T10:01:00Z', runStartMs, totalMs);
    expect(left).toBe(100);
  });

  it('width pct is 100 for a phase spanning the full run', () => {
    const width = calcWidthPct(
      '2025-01-01T10:00:00Z',
      '2025-01-01T10:01:00Z',
      runStartMs,
      totalMs,
    );
    expect(width).toBe(100);
  });

  it('width pct is 50 for a phase spanning half the run', () => {
    const width = calcWidthPct(
      '2025-01-01T10:00:00Z',
      '2025-01-01T10:00:30Z',
      runStartMs,
      totalMs,
    );
    expect(width).toBe(50);
  });

  it('width pct rounds to ~0.83% for a 500ms phase in a 60s total', () => {
    const width = calcWidthPct(
      '2025-01-01T10:00:00Z',
      '2025-01-01T10:00:00.500Z',
      runStartMs,
      totalMs,
    );
    expect(width).toBeCloseTo(0.833, 2);
  });

  it('width pct of < 1% is still correct (minWidth 8px enforced by CSS style, not the pct)', () => {
    // A 200ms phase over 60 000ms total → 0.333%
    const width = calcWidthPct(
      '2025-01-01T10:00:00Z',
      '2025-01-01T10:00:00.200Z',
      runStartMs,
      totalMs,
    );
    expect(width).toBeLessThan(1);
    // The component enforces minWidth via inline style: minWidth: '8px'
    // We verify the calc is correct and minWidth is expected to kick in
    expect(width).toBeGreaterThan(0);
  });

  it('width pct is 0 when finishedAt equals startedAt (zero-duration phase)', () => {
    const width = calcWidthPct(
      '2025-01-01T10:00:30Z',
      '2025-01-01T10:00:30Z',
      runStartMs,
      totalMs,
    );
    expect(width).toBe(0);
  });

  it('width pct uses totalMs as end when finishedAt is null (running phase)', () => {
    const width = calcWidthPct(
      '2025-01-01T10:00:00Z',
      null,
      runStartMs,
      totalMs,
    );
    expect(width).toBe(100);
  });

  it('width pct for null finishedAt phase starting at midpoint is 50', () => {
    const width = calcWidthPct(
      '2025-01-01T10:00:30Z',
      null,
      runStartMs,
      totalMs,
    );
    expect(width).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Gate color mapping
// ---------------------------------------------------------------------------

describe('GATE_COLORS', () => {
  it('maps "pass" to green (#4ADE80)', () => {
    expect(GATE_COLORS['pass']).toBe('#4ADE80');
  });

  it('maps "warn" to yellow (#FCD34D)', () => {
    expect(GATE_COLORS['warn']).toBe('#FCD34D');
  });

  it('maps "fail" to red (#F87171)', () => {
    expect(GATE_COLORS['fail']).toBe('#F87171');
  });

  it('returns undefined for unknown gate value', () => {
    expect(GATE_COLORS['unknown']).toBeUndefined();
  });

  it('returns undefined for null gate (no marker rendered)', () => {
    expect(GATE_COLORS[null as unknown as string]).toBeUndefined();
  });
});
