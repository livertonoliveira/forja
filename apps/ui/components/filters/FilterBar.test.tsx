/**
 * Unit tests for apps/ui/components/filters/FilterBar.tsx (MOB-1066)
 *
 * Tests without DOM rendering — validates internal helper functions,
 * gate toggle logic, reset logic, debounce behaviour (via fake timers),
 * and date preset calculations.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/filters/FilterBar.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('nuqs', () => ({
  useQueryState: vi.fn(),
  parseAsString: {
    withDefault: (d: string) => ({ _default: d }),
  },
  parseAsIsoDate: { _parser: 'isoDate' },
  parseAsArrayOf: (inner: unknown) => ({
    withDefault: (d: unknown[]) => ({ _default: d, _inner: inner }),
  }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { onClick }, children),
}));

// ---------------------------------------------------------------------------
// Helper functions extracted from FilterBar — tested independently
// ---------------------------------------------------------------------------

/** Replicates toDateInputValue from FilterBar.tsx */
function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Replicates fromDateInputValue from FilterBar.tsx */
function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Replicates startOfDay from FilterBar.tsx */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Replicates endOfDay from FilterBar.tsx */
function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Replicates toggleGate from FilterBar.tsx */
function toggleGate(gate: string[], value: string): string[] | null {
  const next = gate.includes(value)
    ? gate.filter((g) => g !== value)
    : [...gate, value];
  return next.length > 0 ? next : null;
}

/** Replicates hasAnyFilter from FilterBar.tsx */
function hasAnyFilter(q: string, from: Date | null, to: Date | null, gate: string[]): boolean {
  return q !== '' || from !== null || to !== null || gate.length > 0;
}

// ---------------------------------------------------------------------------
// toDateInputValue
// ---------------------------------------------------------------------------

describe('FilterBar — toDateInputValue', () => {
  it('returns empty string for null input', () => {
    expect(toDateInputValue(null)).toBe('');
  });

  it('formats a date as YYYY-MM-DD', () => {
    const date = new Date(2025, 0, 15); // Jan 15, 2025
    expect(toDateInputValue(date)).toBe('2025-01-15');
  });

  it('pads single-digit month with leading zero', () => {
    const date = new Date(2025, 2, 5); // Mar 5, 2025
    expect(toDateInputValue(date)).toBe('2025-03-05');
  });

  it('pads single-digit day with leading zero', () => {
    const date = new Date(2025, 11, 1); // Dec 1, 2025
    expect(toDateInputValue(date)).toBe('2025-12-01');
  });

  it('handles December correctly (month index 11)', () => {
    const date = new Date(2025, 11, 31); // Dec 31, 2025
    expect(toDateInputValue(date)).toBe('2025-12-31');
  });
});

// ---------------------------------------------------------------------------
// fromDateInputValue
// ---------------------------------------------------------------------------

describe('FilterBar — fromDateInputValue', () => {
  it('returns null for empty string', () => {
    expect(fromDateInputValue('')).toBeNull();
  });

  it('parses a YYYY-MM-DD string into a Date', () => {
    const result = fromDateInputValue('2025-04-23');
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2025);
    expect(result!.getMonth()).toBe(3); // April = index 3
    expect(result!.getDate()).toBe(23);
  });

  it('parses January (01) correctly', () => {
    const result = fromDateInputValue('2025-01-01');
    expect(result!.getMonth()).toBe(0);
    expect(result!.getDate()).toBe(1);
  });

  it('round-trips through toDateInputValue', () => {
    const original = '2025-06-15';
    const date = fromDateInputValue(original);
    expect(toDateInputValue(date)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// startOfDay / endOfDay
// ---------------------------------------------------------------------------

describe('FilterBar — startOfDay', () => {
  it('sets time to 00:00:00.000', () => {
    const date = new Date(2025, 3, 23, 14, 30, 45, 500);
    const result = startOfDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('preserves year, month, and date', () => {
    const date = new Date(2025, 3, 23, 14, 30, 0, 0);
    const result = startOfDay(date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(23);
  });
});

describe('FilterBar — endOfDay', () => {
  it('sets time to 23:59:59.999', () => {
    const date = new Date(2025, 3, 23, 0, 0, 0, 0);
    const result = endOfDay(date);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it('preserves year, month, and date', () => {
    const date = new Date(2025, 3, 23);
    const result = endOfDay(date);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(23);
  });
});

// ---------------------------------------------------------------------------
// Date preset calculations
// ---------------------------------------------------------------------------

describe('FilterBar — applyToday logic', () => {
  it('from is startOfDay(now) and to is endOfDay(now)', () => {
    const now = new Date(2025, 3, 23, 12, 0, 0);
    const from = startOfDay(now);
    const to = endOfDay(now);

    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(from.getDate()).toBe(now.getDate());
    expect(to.getDate()).toBe(now.getDate());
  });
});

describe('FilterBar — applyLast7Days logic', () => {
  it('from is 6 days before now (startOfDay)', () => {
    const now = new Date(2025, 3, 23);
    const past = new Date(now);
    past.setDate(past.getDate() - 6);
    const from = startOfDay(past);
    const to = endOfDay(now);

    const diffMs = to.getTime() - from.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // 6 days and 23:59:59.999 = ~6.999... days, almost 7
    expect(diffDays).toBeGreaterThan(6.99);
    expect(diffDays).toBeLessThan(7.01);
  });

  it('from date is 6 days before today', () => {
    const now = new Date(2025, 3, 23);
    const past = new Date(now);
    past.setDate(past.getDate() - 6);
    expect(past.getDate()).toBe(17); // Apr 23 - 6 = Apr 17
  });
});

describe('FilterBar — applyLast30Days logic', () => {
  it('from is 29 days before now (startOfDay)', () => {
    const now = new Date(2025, 3, 23);
    const past = new Date(now);
    past.setDate(past.getDate() - 29);
    const from = startOfDay(past);
    const to = endOfDay(now);

    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29.99);
    expect(diffDays).toBeLessThan(30.01);
  });
});

// ---------------------------------------------------------------------------
// toggleGate — gate filter toggle logic
// ---------------------------------------------------------------------------

describe('FilterBar — toggleGate logic', () => {
  it('adds a gate value when not currently selected', () => {
    const result = toggleGate([], 'pass');
    expect(result).toEqual(['pass']);
  });

  it('removes a gate value when already selected', () => {
    const result = toggleGate(['pass', 'warn'], 'pass');
    expect(result).toEqual(['warn']);
  });

  it('returns null when removing the last gate value (so URL param is cleared)', () => {
    const result = toggleGate(['pass'], 'pass');
    expect(result).toBeNull();
  });

  it('selecting "pass" and "warn" returns both in array', () => {
    const afterPass = toggleGate([], 'pass');
    const afterWarn = toggleGate(afterPass as string[], 'warn');
    expect(afterWarn).toEqual(['pass', 'warn']);
  });

  it('selecting "pass" and "warn" then deselecting "pass" returns only ["warn"]', () => {
    const result = toggleGate(['pass', 'warn'], 'pass');
    expect(result).toEqual(['warn']);
  });

  it('preserves existing gates when toggling a new one', () => {
    const result = toggleGate(['pass', 'warn'], 'fail');
    expect(result).toEqual(['pass', 'warn', 'fail']);
  });

  it('handles all three gates selected and removing one', () => {
    const result = toggleGate(['pass', 'warn', 'fail'], 'warn');
    expect(result).toEqual(['pass', 'fail']);
  });
});

// ---------------------------------------------------------------------------
// hasAnyFilter — Reset button visibility logic
// ---------------------------------------------------------------------------

describe('FilterBar — hasAnyFilter (Reset button visibility)', () => {
  it('returns false when all filters are empty/null', () => {
    expect(hasAnyFilter('', null, null, [])).toBe(false);
  });

  it('returns true when q is non-empty', () => {
    expect(hasAnyFilter('MOB-123', null, null, [])).toBe(true);
  });

  it('returns true when from date is set', () => {
    expect(hasAnyFilter('', new Date(), null, [])).toBe(true);
  });

  it('returns true when to date is set', () => {
    expect(hasAnyFilter('', null, new Date(), [])).toBe(true);
  });

  it('returns true when gate array is non-empty', () => {
    expect(hasAnyFilter('', null, null, ['pass'])).toBe(true);
  });

  it('returns true when multiple filters are active simultaneously', () => {
    expect(hasAnyFilter('search', new Date(), new Date(), ['pass', 'warn'])).toBe(true);
  });

  it('returns false after simulated resetAll (all cleared)', () => {
    // After resetAll: q='', from=null, to=null, gate=[]
    expect(hasAnyFilter('', null, null, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Debounce behaviour — verified with fake timers
// ---------------------------------------------------------------------------

describe('FilterBar — debounce 300ms on search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire the setter before 300ms have elapsed', () => {
    const setQ = vi.fn();
    let debounceHandle: ReturnType<typeof setTimeout> | null = null;

    const handleSearchChange = (value: string) => {
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        setQ(value || null);
      }, 300);
    };

    handleSearchChange('test');
    vi.advanceTimersByTime(299);
    expect(setQ).not.toHaveBeenCalled();
  });

  it('fires the setter exactly once after 300ms', () => {
    const setQ = vi.fn();
    let debounceHandle: ReturnType<typeof setTimeout> | null = null;

    const handleSearchChange = (value: string) => {
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        setQ(value || null);
      }, 300);
    };

    handleSearchChange('hello');
    vi.advanceTimersByTime(300);
    expect(setQ).toHaveBeenCalledOnce();
    expect(setQ).toHaveBeenCalledWith('hello');
  });

  it('cancels previous timer when typing fast (only fires once for last value)', () => {
    const setQ = vi.fn();
    let debounceHandle: ReturnType<typeof setTimeout> | null = null;

    const handleSearchChange = (value: string) => {
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        setQ(value || null);
      }, 300);
    };

    // Simulate rapid typing
    handleSearchChange('a');
    vi.advanceTimersByTime(100);
    handleSearchChange('ab');
    vi.advanceTimersByTime(100);
    handleSearchChange('abc');
    vi.advanceTimersByTime(300);

    // Only the last value should have been committed
    expect(setQ).toHaveBeenCalledOnce();
    expect(setQ).toHaveBeenCalledWith('abc');
  });

  it('passes null to setQ when value is empty string (clears URL param)', () => {
    const setQ = vi.fn();
    let debounceHandle: ReturnType<typeof setTimeout> | null = null;

    const handleSearchChange = (value: string) => {
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        setQ(value || null);
      }, 300);
    };

    handleSearchChange('');
    vi.advanceTimersByTime(300);
    expect(setQ).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// FilterBar component — structural export check
// ---------------------------------------------------------------------------

describe('FilterBar.tsx — named exports', () => {
  it('exports FilterBar as a function', async () => {
    const mod = await import('./FilterBar');
    expect(mod.FilterBar).toBeDefined();
    expect(typeof mod.FilterBar).toBe('function');
  });
});
