/**
 * Unit tests for apps/ui/components/charts/chart-utils.tsx (MOB-1068)
 *
 * Tests without DOM rendering — validates pure functions, constants, and
 * GranularityToggle element structure via direct React element inspection.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/charts/chart-utils.test.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

// Mock next-intl before importing chart-utils so GranularityToggle can use useTranslations
vi.mock('next-intl', () => {
  const msgs: Record<string, Record<string, string>> = {
    'gantt.granularity': { hour: 'hora', day: 'dia', week: 'semana', month: 'mês' },
  };
  return {
    useTranslations: (ns: string) => (key: string) => msgs[ns]?.[key] ?? key,
  };
});

import {
  formatBucket,
  GRANULARITY_LABELS,
  GRANULARITIES,
  GranularityToggle,
} from './chart-utils';

// ---------------------------------------------------------------------------
// formatBucket — pure function
// ---------------------------------------------------------------------------

describe('formatBucket() — granularity=hour', () => {
  it('returns HH:mm format (matches ##:## pattern)', () => {
    // ISO string with explicit UTC offset so the result is deterministic
    // regardless of the host's timezone when using pt-BR locale.
    const result = formatBucket('2024-06-15T14:30:00', 'hour');
    // Result must match HH:mm (two digits colon two digits)
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('does not include a date portion for hour granularity', () => {
    const result = formatBucket('2024-06-15T09:05:00', 'hour');
    // Must not contain a slash (date separator used by day/week/month)
    expect(result).not.toContain('/');
  });
});

describe('formatBucket() — granularity=day', () => {
  it('returns DD/MM format (matches ##/## pattern)', () => {
    const result = formatBucket('2024-03-07T00:00:00', 'day');
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });
});

describe('formatBucket() — granularity=week', () => {
  it('returns DD/MM format (matches ##/## pattern)', () => {
    const result = formatBucket('2024-01-01T00:00:00', 'week');
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });
});

describe('formatBucket() — granularity=month', () => {
  it('returns DD/MM format (matches ##/## pattern)', () => {
    const result = formatBucket('2024-12-01T00:00:00', 'month');
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// GRANULARITY_LABELS — constant
// ---------------------------------------------------------------------------

describe('GRANULARITY_LABELS', () => {
  it('has exactly 4 keys', () => {
    expect(Object.keys(GRANULARITY_LABELS)).toHaveLength(4);
  });

  it('has key "hour"', () => {
    expect(GRANULARITY_LABELS).toHaveProperty('hour');
  });

  it('has key "day"', () => {
    expect(GRANULARITY_LABELS).toHaveProperty('day');
  });

  it('has key "week"', () => {
    expect(GRANULARITY_LABELS).toHaveProperty('week');
  });

  it('has key "month"', () => {
    expect(GRANULARITY_LABELS).toHaveProperty('month');
  });

  it('all values are non-empty strings', () => {
    for (const key of ['hour', 'day', 'week', 'month'] as const) {
      expect(typeof GRANULARITY_LABELS[key]).toBe('string');
      expect(GRANULARITY_LABELS[key].length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// GRANULARITIES — constant
// ---------------------------------------------------------------------------

describe('GRANULARITIES', () => {
  it('is an array with 4 elements', () => {
    expect(Array.isArray(GRANULARITIES)).toBe(true);
    expect(GRANULARITIES).toHaveLength(4);
  });

  it('contains all 4 granularity values', () => {
    expect(GRANULARITIES).toContain('hour');
    expect(GRANULARITIES).toContain('day');
    expect(GRANULARITIES).toContain('week');
    expect(GRANULARITIES).toContain('month');
  });
});

// ---------------------------------------------------------------------------
// GranularityToggle — element structure (no DOM)
// ---------------------------------------------------------------------------

type AnyProps = Record<string, unknown>;

/** Recursively collects all React elements matching a predicate. */
function collectElements(
  node: React.ReactNode,
  predicate: (el: React.ReactElement) => boolean,
): React.ReactElement[] {
  const result: React.ReactElement[] = [];

  if (!React.isValidElement(node)) return result;

  const el = node as React.ReactElement<AnyProps>;
  if (predicate(el)) result.push(el);

  const children = el.props.children as React.ReactNode | React.ReactNode[] | undefined;
  if (!children) return result;

  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    result.push(...collectElements(child as React.ReactNode, predicate));
  }
  return result;
}

function renderToggle(value: 'hour' | 'day' | 'week' | 'month', onChange: () => void) {
  return (GranularityToggle as (p: { value: typeof value; onChange: () => void }) => React.ReactElement)(
    { value, onChange },
  );
}

describe('GranularityToggle — button count', () => {
  it('renders 4 buttons (one per granularity)', () => {
    const el = renderToggle('day', () => {});
    const buttons = collectElements(el, (e) => e.type === 'button');
    expect(buttons).toHaveLength(4);
  });
});

// Translated labels returned by the next-intl mock
const MOCK_LABELS: Record<string, string> = {
  hour: 'hora',
  day: 'dia',
  week: 'semana',
  month: 'mês',
};

describe('GranularityToggle — active button highlight', () => {
  it('active button has border-forja-border-gold class', () => {
    const el = renderToggle('week', () => {});
    const buttons = collectElements(el, (e) => e.type === 'button');

    // Find the active button by its translated label (from i18n mock)
    const activeLabel = MOCK_LABELS['week'];
    const activeButton = buttons.find((b) => {
      const children = b.props.children as React.ReactNode;
      return String(children) === activeLabel;
    });

    expect(activeButton).toBeDefined();
    const className = String(activeButton?.props.className ?? '');
    expect(className).toContain('border-forja-border-gold');
  });

  it('inactive buttons do NOT have bg-forja-bg-elevated class', () => {
    const el = renderToggle('hour', () => {});
    const buttons = collectElements(el, (e) => e.type === 'button');

    const activeLabel = MOCK_LABELS['hour'];
    const inactiveButtons = buttons.filter((b) => {
      const children = b.props.children as React.ReactNode;
      return String(children) !== activeLabel;
    });

    for (const btn of inactiveButtons) {
      const className = String(btn.props.className ?? '');
      expect(className).not.toContain('bg-forja-bg-elevated');
    }
  });
});

describe('GranularityToggle — onChange callback', () => {
  it('each button has an onClick handler', () => {
    const onChange = vi.fn();
    const el = renderToggle('day', onChange);
    const buttons = collectElements(el, (e) => e.type === 'button');

    for (const btn of buttons) {
      expect(typeof btn.props.onClick).toBe('function');
    }
  });

  it('clicking a button calls onChange with the corresponding granularity', () => {
    const onChange = vi.fn();
    const el = renderToggle('day', onChange);
    const buttons = collectElements(el, (e) => e.type === 'button');

    // Simulate click on each button
    for (const btn of buttons) {
      const onClick = btn.props.onClick as (() => void) | undefined;
      onClick?.();
    }

    expect(onChange).toHaveBeenCalledTimes(4);
    const calledWith = onChange.mock.calls.map((c) => c[0]);
    expect(calledWith).toContain('hour');
    expect(calledWith).toContain('day');
    expect(calledWith).toContain('week');
    expect(calledWith).toContain('month');
  });
});
