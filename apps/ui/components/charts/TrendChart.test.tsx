/**
 * Unit tests for apps/ui/components/charts/TrendChart.tsx (MOB-1068)
 *
 * Tests without DOM rendering — validates exports and render-branch logic
 * by mocking React hooks via vi.mock so we can control component state and
 * inspect the returned React element tree without a DOM environment.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/charts/TrendChart.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mock React hooks before importing the component
// ---------------------------------------------------------------------------

// We mock 'react' so we can control useState/useEffect/useCallback/useMemo
// to return controlled state snapshots without running the real hook machinery.

// Shared mutable state injected by each test
const _mockState = {
  granularity: 'day' as string,
  data: [] as unknown[],
  loading: true,
  error: false,
};

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();

  let callIndex = 0;

  const useState = vi.fn((initial: unknown) => {
    const idx = callIndex;
    callIndex += 1;
    // TrendChart useState call order: granularity(0), data(1), loading(2), error(3)
    switch (idx) {
      case 0: return [_mockState.granularity, vi.fn()];
      case 1: return [_mockState.data, vi.fn()];
      case 2: return [_mockState.loading, vi.fn()];
      case 3: return [_mockState.error, vi.fn()];
      default: return [initial, vi.fn()];
    }
  });

  // Reset call index before each render
  // We expose the reset so beforeEach can call it
  (useState as unknown as { _reset: () => void })._reset = () => { callIndex = 0; };

  return {
    ...actual,
    useState,
    useEffect: vi.fn(),                     // no-op
    useCallback: vi.fn((fn: unknown) => fn), // return fn as-is
    useMemo: vi.fn((fn: () => unknown) => fn()), // run immediately
  };
});

// Import AFTER mocking
import { TrendChart } from './TrendChart';
import type { LineConfig } from './TrendChart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnyProps = Record<string, unknown>;

/** Recursively flattens a React tree into a list of all ReactElements. */
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

/** Collects all text leaf nodes from a React tree. */
function allText(node: React.ReactNode): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (!React.isValidElement(node)) return [];
  const el = node as React.ReactElement<AnyProps>;
  const children = el.props.children as React.ReactNode | React.ReactNode[] | undefined;
  if (!children) return [];
  const childArray = Array.isArray(children) ? children : [children];
  const texts: string[] = [];
  for (const child of childArray) {
    texts.push(...allText(child as React.ReactNode));
  }
  return texts;
}

const LINES: LineConfig[] = [
  { dataKey: 'count', stroke: '#C9A84C', name: 'Runs' },
];

function render(stateOverrides: Partial<typeof _mockState>): React.ReactElement<AnyProps> {
  // Reset useState call index before each render
  const useState = React.useState as unknown as { _reset?: () => void };
  useState._reset?.();

  // Inject state
  Object.assign(_mockState, {
    granularity: 'day',
    data: [],
    loading: true,
    error: false,
    ...stateOverrides,
  });

  return (TrendChart as (p: { metric: string; lines: LineConfig[]; title: string }) => React.ReactElement<AnyProps>)({
    metric: 'runs',
    lines: LINES,
    title: 'Test Chart',
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('TrendChart.tsx — named exports', () => {
  it('exports TrendChart as a function', () => {
    expect(typeof TrendChart).toBe('function');
  });
});

describe('TrendChart.tsx — LineConfig type shape', () => {
  it('LineConfig object has dataKey, stroke, and name', () => {
    const config: LineConfig = { dataKey: 'count', stroke: '#C9A84C', name: 'Runs' };
    expect(config.dataKey).toBe('count');
    expect(config.stroke).toBe('#C9A84C');
    expect(config.name).toBe('Runs');
  });
});

// ---------------------------------------------------------------------------
// Reset state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  const useState = React.useState as unknown as { _reset?: () => void };
  useState._reset?.();
});

// ---------------------------------------------------------------------------
// Render: loading state
// ---------------------------------------------------------------------------

describe('TrendChart — loading state', () => {
  it('renders a Skeleton element while loading=true', () => {
    const el = render({ loading: true });
    const all = flattenElements(el);
    const hasSkeleton = all.some(
      (e) =>
        typeof e.type === 'function' &&
        (e.type as { name?: string }).name === 'Skeleton',
    );
    expect(hasSkeleton).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Render: error state
// ---------------------------------------------------------------------------

describe('TrendChart — error state', () => {
  it('renders error message when error=true and loading=false', () => {
    const el = render({ loading: false, error: true });
    const texts = allText(el).join(' ');
    expect(texts).toContain('Falha ao carregar dados');
  });
});

// ---------------------------------------------------------------------------
// Render: empty data state
// ---------------------------------------------------------------------------

describe('TrendChart — empty data state', () => {
  it('renders "Sem dados" message when data=[] and loading=false', () => {
    const el = render({ loading: false, error: false, data: [] });
    const texts = allText(el).join(' ');
    expect(texts).toContain('Sem dados');
  });
});

// ---------------------------------------------------------------------------
// Render: always-visible elements
// ---------------------------------------------------------------------------

describe('TrendChart — always-rendered elements', () => {
  it('renders the title prop as text', () => {
    const el = render({ loading: true });
    const texts = allText(el);
    expect(texts).toContain('Test Chart');
  });

  it('renders "Exportar CSV" button', () => {
    const el = render({ loading: true });
    const all = flattenElements(el);
    const buttons = all.filter((e) => e.type === 'button');
    const csvBtn = buttons.find((b) => allText(b).some((t) => t.includes('Exportar CSV')));
    expect(csvBtn).toBeDefined();
  });
});
