/**
 * Unit tests for apps/ui/components/HeatmapGrid.tsx (MOB-1069)
 *
 * Tests pure functions inline (copied from HeatmapGrid.tsx) so the suite is
 * self-contained and requires no DOM / React rendering.
 *
 * Run from apps/ui:
 *   npx vitest run components/HeatmapGrid.test.ts
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure functions — copied verbatim from HeatmapGrid.tsx
// ---------------------------------------------------------------------------

const COLOR_EMPTY = '#0A0A0A';

function intensityToColor(value: number, max: number): string {
  if (max === 0) return COLOR_EMPTY;
  const t = Math.min(value / max, 1);
  const r = Math.round(10 + (226 - 10) * t);
  const g = Math.round(10 + (201 - 10) * t);
  const b = Math.round(10 + (126 - 10) * t);
  return `rgb(${r},${g},${b})`;
}

function getLast365Dates(): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function bucketEnd(date: string, hour: number): string {
  const d = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString().replace('.000Z', 'Z');
}

// ---------------------------------------------------------------------------
// intensityToColor
// ---------------------------------------------------------------------------

describe('intensityToColor() — max === 0', () => {
  it('returns COLOR_EMPTY (#0A0A0A) regardless of value', () => {
    expect(intensityToColor(0, 0)).toBe('#0A0A0A');
    expect(intensityToColor(100, 0)).toBe('#0A0A0A');
  });
});

describe('intensityToColor() — value === 0', () => {
  it('returns the dark/empty rgb color when value is 0', () => {
    const result = intensityToColor(0, 100);
    // t = 0 → r=10, g=10, b=10
    expect(result).toBe('rgb(10,10,10)');
  });

  it('returns rgb(10,10,10) when value is near zero (0.001)', () => {
    const result = intensityToColor(0.001, 100);
    // t ≈ 0 → rounded values still very close to 10
    expect(result).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    // Red channel must be close to 10
    const r = parseInt(result.match(/rgb\((\d+),/)![1]);
    expect(r).toBeLessThanOrEqual(12);
  });
});

describe('intensityToColor() — value === max (full intensity)', () => {
  it('returns the bright gold-ish color rgb(226,201,126)', () => {
    const result = intensityToColor(50, 50);
    // t = 1 → r=226, g=201, b=126
    expect(result).toBe('rgb(226,201,126)');
  });
});

describe('intensityToColor() — 50% interpolation', () => {
  it('returns a color between the dark base and bright gold at midpoint', () => {
    const result = intensityToColor(50, 100);
    // t = 0.5 → r = round(10 + 216*0.5) = round(118) = 118
    //           g = round(10 + 191*0.5) = round(105.5) = 106
    //           b = round(10 + 116*0.5) = round(68) = 68
    expect(result).toBe('rgb(118,106,68)');

    // Confirm the midpoint is strictly darker than max and lighter than min
    const r = parseInt(result.match(/rgb\((\d+),/)![1]);
    expect(r).toBeGreaterThan(10);
    expect(r).toBeLessThan(226);
  });
});

describe('intensityToColor() — clamping at 1 (value > max)', () => {
  it('gives the same result as value === max when value exceeds max', () => {
    const atMax = intensityToColor(100, 100);
    const overMax = intensityToColor(200, 100);
    expect(overMax).toBe(atMax);
    expect(overMax).toBe('rgb(226,201,126)');
  });
});

// ---------------------------------------------------------------------------
// getLast365Dates
// ---------------------------------------------------------------------------

describe('getLast365Dates() — length', () => {
  it('returns exactly 365 dates', () => {
    const dates = getLast365Dates();
    expect(dates).toHaveLength(365);
  });
});

describe('getLast365Dates() — first date is ~364 days ago', () => {
  it('first date is 364 days before today', () => {
    const dates = getLast365Dates();
    const today = new Date();
    const expected364DaysAgo = new Date(today);
    expected364DaysAgo.setDate(today.getDate() - 364);
    const expectedStr = expected364DaysAgo.toISOString().split('T')[0];
    expect(dates[0]).toBe(expectedStr);
  });
});

describe('getLast365Dates() — last date is today', () => {
  it('last date matches today in YYYY-MM-DD format', () => {
    const dates = getLast365Dates();
    const todayStr = new Date().toISOString().split('T')[0];
    expect(dates[dates.length - 1]).toBe(todayStr);
  });
});

describe('getLast365Dates() — YYYY-MM-DD format', () => {
  it('all dates match YYYY-MM-DD pattern', () => {
    const dates = getLast365Dates();
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
    for (const date of dates) {
      expect(date).toMatch(isoDatePattern);
    }
  });
});

describe('getLast365Dates() — ascending order', () => {
  it('dates are strictly ascending (each date > previous)', () => {
    const dates = getLast365Dates();
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// bucketEnd
// ---------------------------------------------------------------------------

describe('bucketEnd() — hour < 23', () => {
  it('returns an ISO string with the next hour on the same day', () => {
    const result = bucketEnd('2024-06-15', 14);
    // Expects 2024-06-15T15:00:00Z
    expect(result).toBe('2024-06-15T15:00:00Z');
  });

  it('returns an ISO string with the next hour on the same day for hour 0', () => {
    const result = bucketEnd('2024-01-01', 0);
    expect(result).toBe('2024-01-01T01:00:00Z');
  });

  it('returns an ISO string with the next hour on the same day for hour 22', () => {
    const result = bucketEnd('2024-03-10', 22);
    expect(result).toBe('2024-03-10T23:00:00Z');
  });
});

describe('bucketEnd() — hour === 23 (midnight rollover)', () => {
  it('returns 00:00 of the following day', () => {
    const result = bucketEnd('2024-06-15', 23);
    expect(result).toBe('2024-06-16T00:00:00Z');
  });

  it('handles month-boundary rollover correctly', () => {
    const result = bucketEnd('2024-01-31', 23);
    expect(result).toBe('2024-02-01T00:00:00Z');
  });

  it('handles year-boundary rollover correctly', () => {
    const result = bucketEnd('2024-12-31', 23);
    expect(result).toBe('2025-01-01T00:00:00Z');
  });
});

describe('bucketEnd() — ISO string format', () => {
  it('always returns a valid ISO string ending with Z', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    expect(bucketEnd('2024-06-15', 10)).toMatch(isoPattern);
    expect(bucketEnd('2024-06-15', 23)).toMatch(isoPattern);
    expect(bucketEnd('2024-12-31', 0)).toMatch(isoPattern);
  });
});
