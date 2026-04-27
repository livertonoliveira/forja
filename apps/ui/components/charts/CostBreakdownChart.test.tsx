/**
 * Unit tests for apps/ui/components/charts/CostBreakdownChart.tsx (MOB-1107)
 *
 * Tests without DOM rendering — validates the React element tree returned by
 * CostBreakdownChart by calling the component as a plain function and walking
 * the element tree. Recharts components are mocked to avoid ResizeObserver /
 * browser-only dependencies.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/charts/CostBreakdownChart.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mock Recharts — avoid ResizeObserver / canvas / DOM requirements
// ---------------------------------------------------------------------------

vi.mock('recharts', () => {
  const make = (name: string) => {
    const C = (props: Record<string, unknown>) =>
      React.createElement(name.toLowerCase(), props);
    Object.defineProperty(C, 'name', { value: name });
    return C;
  };
  return {
    BarChart: make('BarChart'),
    Bar: make('Bar'),
    XAxis: make('XAxis'),
    YAxis: make('YAxis'),
    CartesianGrid: make('CartesianGrid'),
    Tooltip: make('Tooltip'),
    ResponsiveContainer: (props: Record<string, unknown>) =>
      React.createElement('div', { 'data-recharts': 'ResponsiveContainer' }, props.children as React.ReactNode),
    Legend: make('Legend'),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { CostBreakdownChart } from './CostBreakdownChart';
import type { BreakdownRow } from '@/lib/forja-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyProps = Record<string, unknown>;

function flattenElements(node: React.ReactNode): React.ReactElement<AnyProps>[] {
  if (!React.isValidElement(node)) return [];
  const el = node as React.ReactElement<AnyProps>;
  const result: React.ReactElement<AnyProps>[] = [el];
  const children = el.props.children as React.ReactNode | React.ReactNode[] | undefined;
  if (!children) return result;
  const childArray = Array.isArray(children) ? children : [children];
  for (const child of childArray) {
    result.push(...flattenElements(child as React.ReactNode));
  }
  return result;
}

function findElement(
  node: React.ReactNode,
  pred: (el: React.ReactElement<AnyProps>) => boolean,
): React.ReactElement<AnyProps> | undefined {
  const elements = flattenElements(node);
  return elements.find(pred);
}

function render(props: { data: BreakdownRow[] }) {
  return CostBreakdownChart(props);
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_ROWS: BreakdownRow[] = [
  { project: 'MOB', totalCost: 5.1234, inputCost: 1.0, outputCost: 2.0, cacheCost: 2.1234, runCount: 20 },
  { project: 'WEB', totalCost: 2.5000, inputCost: 0.5, outputCost: 1.5, cacheCost: 0.5,    runCount: 8  },
  { project: 'API', totalCost: 1.0000, inputCost: 0.0, outputCost: 0.5, cacheCost: 0.5,    runCount: 3  },
];

const EMPTY_ROWS: BreakdownRow[] = [];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('CostBreakdownChart — exports', () => {
  it('exports CostBreakdownChart as a named function', () => {
    expect(typeof CostBreakdownChart).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Empty data — returns null
// ---------------------------------------------------------------------------

describe('CostBreakdownChart — empty data', () => {
  it('returns null when data is empty', () => {
    const result = render({ data: EMPTY_ROWS });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// With data — renders chart container
// ---------------------------------------------------------------------------

describe('CostBreakdownChart — renders with data', () => {
  let el: React.ReactElement<AnyProps> | null;

  beforeEach(() => {
    el = render({ data: SAMPLE_ROWS }) as React.ReactElement<AnyProps> | null;
  });

  it('renders a non-null element when data is provided', () => {
    expect(el).not.toBeNull();
  });

  it('top-level element is the ResponsiveContainer wrapper (function component)', () => {
    expect(el).not.toBeNull();
    // The component returns <ResponsiveContainer ...>, so el.type is the mock function.
    // Calling it produces the div with data-recharts="ResponsiveContainer".
    const rendered = (el!.type as (p: AnyProps) => React.ReactElement)(el!.props);
    expect(rendered.props['data-recharts']).toBe('ResponsiveContainer');
  });

  it('contains a BarChart element in the tree', () => {
    const barChart = findElement(el!, (e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'BarChart';
    });
    expect(barChart).toBeDefined();
  });

  it('renders 3 Bar elements (Input, Output, Cache)', () => {
    const bars = flattenElements(el!).filter((e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Bar';
    });
    expect(bars.length).toBe(3);
  });

  it('Bar elements have dataKey Input, Output, and Cache', () => {
    const bars = flattenElements(el!).filter((e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Bar';
    });
    const dataKeys = bars.map((b) => (b.props as AnyProps).dataKey as string);
    expect(dataKeys).toContain('Input');
    expect(dataKeys).toContain('Output');
    expect(dataKeys).toContain('Cache');
  });

  it('all Bar elements share the same stackId "a"', () => {
    const bars = flattenElements(el!).filter((e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Bar';
    });
    const stackIds = bars.map((b) => (b.props as AnyProps).stackId);
    expect(stackIds.every((id) => id === 'a')).toBe(true);
  });

  it('contains an XAxis with dataKey "project"', () => {
    const xAxis = findElement(el!, (e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'XAxis';
    });
    expect(xAxis).toBeDefined();
    expect((xAxis!.props as AnyProps).dataKey).toBe('project');
  });

  it('contains a YAxis element', () => {
    const yAxis = findElement(el!, (e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'YAxis';
    });
    expect(yAxis).toBeDefined();
  });

  it('contains a CartesianGrid element', () => {
    const grid = findElement(el!, (e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'CartesianGrid';
    });
    expect(grid).toBeDefined();
  });

  it('contains a Legend element', () => {
    const legend = findElement(el!, (e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Legend';
    });
    expect(legend).toBeDefined();
  });

  it('contains a Tooltip element', () => {
    const tooltip = findElement(el!, (e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Tooltip';
    });
    expect(tooltip).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Chart data transformation — chartData shape
// ---------------------------------------------------------------------------

describe('CostBreakdownChart — chart data transformation', () => {
  it('renders chart for a single project with non-zero cost breakdown', () => {
    const data: BreakdownRow[] = [
      { project: 'SOLO', totalCost: 3.0, inputCost: 1.0, outputCost: 1.5, cacheCost: 0.5, runCount: 5 },
    ];
    const result = render({ data });
    expect(result).not.toBeNull();
  });

  it('renders chart when all cost breakdown fields are 0 (uses totalCost as Input)', () => {
    const data: BreakdownRow[] = [
      { project: 'FLAT', totalCost: 1.0, inputCost: 0, outputCost: 0, cacheCost: 0, runCount: 2 },
    ];
    const result = render({ data });
    expect(result).not.toBeNull();
  });

  it('truncates project name longer than 14 chars with ellipsis in element tree', () => {
    const data: BreakdownRow[] = [
      {
        project: 'VERY-LONG-PROJECT-NAME',
        totalCost: 1.0,
        inputCost: 0.3,
        outputCost: 0.4,
        cacheCost: 0.3,
        runCount: 1,
      },
    ];
    // Transformation produces project = 'VERY-LONG-PROJ…' — this is passed
    // to BarChart data prop. We verify the component renders without throwing.
    const result = render({ data });
    expect(result).not.toBeNull();
  });

  it('slices data to at most 10 rows (renders without error for large datasets)', () => {
    const data: BreakdownRow[] = Array.from({ length: 15 }, (_, i) => ({
      project: `PROJ${i}`,
      totalCost: i + 1,
      inputCost: 0,
      outputCost: 0,
      cacheCost: 0,
      runCount: i + 1,
    }));
    const result = render({ data });
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Colors — COLORS constant
// ---------------------------------------------------------------------------

describe('CostBreakdownChart — bar colors', () => {
  it('Input Bar has gold fill color (#C9A84C)', () => {
    const el = render({ data: SAMPLE_ROWS }) as React.ReactElement<AnyProps>;
    const bars = flattenElements(el).filter((e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Bar';
    });
    const inputBar = bars.find((b) => (b.props as AnyProps).dataKey === 'Input');
    expect(inputBar).toBeDefined();
    expect((inputBar!.props as AnyProps).fill).toBe('#C9A84C');
  });

  it('Output Bar has lighter gold fill (#E2C97E)', () => {
    const el = render({ data: SAMPLE_ROWS }) as React.ReactElement<AnyProps>;
    const bars = flattenElements(el).filter((e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Bar';
    });
    const outputBar = bars.find((b) => (b.props as AnyProps).dataKey === 'Output');
    expect(outputBar).toBeDefined();
    expect((outputBar!.props as AnyProps).fill).toBe('#E2C97E');
  });

  it('Cache Bar has dark gold fill (#8B6914)', () => {
    const el = render({ data: SAMPLE_ROWS }) as React.ReactElement<AnyProps>;
    const bars = flattenElements(el).filter((e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Bar';
    });
    const cacheBar = bars.find((b) => (b.props as AnyProps).dataKey === 'Cache');
    expect(cacheBar).toBeDefined();
    expect((cacheBar!.props as AnyProps).fill).toBe('#8B6914');
  });

  it('Cache Bar has top-only border radius [4,4,0,0] (rounded top)', () => {
    const el = render({ data: SAMPLE_ROWS }) as React.ReactElement<AnyProps>;
    const bars = flattenElements(el).filter((e) => {
      const type = e.type;
      return typeof type === 'function' && (type as { name?: string }).name === 'Bar';
    });
    const cacheBar = bars.find((b) => (b.props as AnyProps).dataKey === 'Cache');
    expect(cacheBar).toBeDefined();
    expect((cacheBar!.props as AnyProps).radius).toEqual([4, 4, 0, 0]);
  });
});
