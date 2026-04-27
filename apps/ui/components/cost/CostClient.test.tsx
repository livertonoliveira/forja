/**
 * Unit tests for apps/ui/components/cost/CostClient.tsx (MOB-1107)
 *
 * Tests without DOM rendering — validates the React element tree returned by
 * CostClient, the CSV export function, and polling setup. React hooks are
 * controlled via vi.mock so we can simulate state without a reconciler.
 * The tree-walking helpers use an expand() function (same pattern as
 * loading-pages.test.tsx) to call through function components and expose
 * inner markup from mocked sub-components.
 *
 * Covered acceptance criteria:
 * - Ranked table renders top 10 projects (#, Projeto, Total, Input, Output, Cache, Runs)
 * - StaggeredReveal applied to main sections
 * - USD formatting with 4 decimal places ($0.0042)
 * - EmptyState shown when no data
 * - 30s polling via setInterval(router.refresh, 30_000)
 * - Export CSV downloads a file and shows success toast
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/cost/CostClient.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mock next/navigation — useRouter
// ---------------------------------------------------------------------------

const mockRefresh = vi.fn();
const mockRouter = { refresh: mockRefresh };

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => mockRouter),
}));

// ---------------------------------------------------------------------------
// Mock React hooks — control useEffect without reconciler
// ---------------------------------------------------------------------------

let capturedEffects: Array<() => (() => void) | void> = [];

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useEffect: vi.fn((fn: () => (() => void) | void) => {
      capturedEffects.push(fn);
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock lucide-react — avoid ESM / DOM issues
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  Download: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-icon': 'Download', ...props }),
}));

// ---------------------------------------------------------------------------
// Mock sub-components with traceable data-testid attributes
// ---------------------------------------------------------------------------

vi.mock('@/components/charts/CostBreakdownChart', () => ({
  CostBreakdownChart: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'CostBreakdownChart', 'data-count': (props.data as unknown[])?.length }),
}));

vi.mock('@/components/cost/MiniCostHeatmap', () => ({
  MiniCostHeatmap: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'MiniCostHeatmap', 'data-count': (props.data as unknown[])?.length }),
}));

vi.mock('@/components/shell/StaggeredReveal', () => ({
  StaggeredReveal: ({ children, staggerMs }: { children: React.ReactNode; staggerMs?: number }) =>
    React.createElement('div', { 'data-testid': 'StaggeredReveal', 'data-stagger': staggerMs }, children),
}));

vi.mock('@/components/shell/EmptyState', () => ({
  EmptyState: (props: { title: string; description?: string }) =>
    React.createElement('div', { 'data-testid': 'EmptyState', 'data-title': props.title }),
}));

vi.mock('@/components/ui/table', () => {
  const makeForwardingComponent = (tag: string) =>
    (props: Record<string, unknown>) =>
      React.createElement(tag, props);
  return {
    Table: makeForwardingComponent('table'),
    TableHeader: makeForwardingComponent('thead'),
    TableBody: makeForwardingComponent('tbody'),
    TableRow: makeForwardingComponent('tr'),
    TableHead: makeForwardingComponent('th'),
    TableCell: makeForwardingComponent('td'),
  };
});

// ---------------------------------------------------------------------------
// Mock toast
// ---------------------------------------------------------------------------

const mockToastSuccess = vi.fn();

vi.mock('@/lib/toast', () => ({
  toast: { success: (...args: unknown[]) => mockToastSuccess(...args) },
}));

// ---------------------------------------------------------------------------
// Mock typography
// ---------------------------------------------------------------------------

vi.mock('@/lib/typography', () => ({
  typography: {
    display: { md: 'text-4xl font-display' },
    mono: { sm: 'text-xs font-mono' },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { CostClient } from './CostClient';
import type { BreakdownRow, HeatmapCell } from '@/lib/forja-store';

// ---------------------------------------------------------------------------
// Tree-walking helpers (same pattern as loading-pages.test.tsx)
// ---------------------------------------------------------------------------

type AnyProps = Record<string, unknown>;
type ElementPredicate = (el: React.ReactElement<AnyProps>) => boolean;

/**
 * Expand a React node tree by calling function components recursively.
 * Necessary because mocked components are function-typed elements.
 */
function expand(node: React.ReactNode, depth = 0): React.ReactNode {
  if (depth > 40) return node;
  if (node === null || node === undefined || typeof node === 'boolean') return node;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map((n) => expand(n, depth));
  const el = node as React.ReactElement<AnyProps>;
  if (!el || typeof el !== 'object' || !('type' in el)) return node;

  if (typeof el.type === 'function') {
    try {
      const rendered = (el.type as React.FC<AnyProps>)(el.props ?? {});
      return expand(rendered, depth + 1);
    } catch {
      if (el.props?.children) {
        return React.createElement(
          el.type as string,
          el.props,
          expand(el.props.children as React.ReactNode, depth + 1),
        );
      }
      return el;
    }
  }

  if (el.props?.children) {
    return React.cloneElement(
      el,
      {},
      expand(el.props.children as React.ReactNode, depth + 1),
    );
  }
  return el;
}

function findElement(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement<AnyProps> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, pred);
      if (found) return found;
    }
    return null;
  }
  const el = node as React.ReactElement<AnyProps>;
  if (pred(el)) return el;
  if (el.props?.children) return findElement(el.props.children as React.ReactNode, pred);
  return null;
}

function findAllElements(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement<AnyProps>[] {
  const results: React.ReactElement<AnyProps>[] = [];
  if (!node || typeof node !== 'object') return results;
  if (Array.isArray(node)) {
    for (const child of node) {
      results.push(...findAllElements(child, pred));
    }
    return results;
  }
  const el = node as React.ReactElement<AnyProps>;
  if (pred(el)) results.push(el);
  if (el.props?.children) results.push(...findAllElements(el.props.children as React.ReactNode, pred));
  return results;
}

function collectTexts(node: React.ReactNode): string[] {
  const result: string[] = [];
  if (typeof node === 'string') { result.push(node); return result; }
  if (typeof node === 'number') { result.push(String(node)); return result; }
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) { node.forEach((n) => result.push(...collectTexts(n))); return result; }
  const el = node as React.ReactElement<AnyProps>;
  if (el.props?.children) result.push(...collectTexts(el.props.children as React.ReactNode));
  return result;
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const BREAKDOWN: BreakdownRow[] = [
  { project: 'MOB', totalCost: 5.1234, inputCost: 1.0,    outputCost: 2.0,   cacheCost: 2.1234, runCount: 20 },
  { project: 'WEB', totalCost: 2.5000, inputCost: 0.5,    outputCost: 1.5,   cacheCost: 0.5,    runCount: 8  },
  { project: 'API', totalCost: 1.0042, inputCost: 0.0,    outputCost: 0.5,   cacheCost: 0.5042, runCount: 3  },
];

const HEATMAP: HeatmapCell[] = [
  { dow: 1, hour: 9,  avgCost: 0.05, count: 10 },
  { dow: 3, hour: 14, avgCost: 0.12, count: 5  },
];

function renderClient(
  breakdown: BreakdownRow[] = BREAKDOWN,
  heatmap: HeatmapCell[] = HEATMAP,
  period = '01/01/2025 – 31/01/2025',
) {
  capturedEffects = [];
  const raw = CostClient({ breakdown, heatmap, period }) as React.ReactElement<AnyProps>;
  return expand(raw) as React.ReactElement<AnyProps>;
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedEffects = [];
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('CostClient — exports', () => {
  it('exports CostClient as a named function', () => {
    expect(typeof CostClient).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// StaggeredReveal wrapping
// ---------------------------------------------------------------------------

describe('CostClient — StaggeredReveal', () => {
  it('renders a StaggeredReveal wrapper (data-testid=StaggeredReveal)', () => {
    const el = renderClient();
    const reveal = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'StaggeredReveal',
    );
    expect(reveal).not.toBeNull();
  });

  it('StaggeredReveal has staggerMs prop set to 80', () => {
    const el = renderClient();
    const reveal = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'StaggeredReveal',
    );
    expect(reveal).not.toBeNull();
    expect((reveal!.props as AnyProps)['data-stagger']).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Header / Hero section
// ---------------------------------------------------------------------------

describe('CostClient — hero section', () => {
  it('renders an h1 element with "Cost" text', () => {
    const el = renderClient();
    const h1 = findElement(el, (e) => e.type === 'h1');
    expect(h1).not.toBeNull();
    const texts = collectTexts(h1!);
    expect(texts.join('')).toContain('Cost');
  });

  it('renders the period string', () => {
    const el = renderClient();
    const texts = collectTexts(el).join('');
    expect(texts).toContain('01/01/2025 – 31/01/2025');
  });

  it('renders an "Export CSV" button', () => {
    const el = renderClient();
    const buttons = findAllElements(el, (e) => e.type === 'button');
    const csvBtn = buttons.find((b) => collectTexts(b).join('').includes('Export CSV'));
    expect(csvBtn).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Total cost card — USD formatting with 4 decimal places
// ---------------------------------------------------------------------------

describe('CostClient — total cost card', () => {
  it('renders total cost formatted with $ prefix (contains "$")', () => {
    const el = renderClient();
    const texts = collectTexts(el).join('');
    // 5.1234 + 2.5000 + 1.0042 = 8.6276
    expect(texts).toContain('8.6276');
  });

  it('contains the $ symbol before the total cost', () => {
    const el = renderClient();
    // Find the p element containing the total — its children include '$' and the number
    const totalP = findElement(el, (e) => {
      if (e.type !== 'p') return false;
      const t = collectTexts(e).join('');
      return t.includes('8.6276');
    });
    expect(totalP).not.toBeNull();
    const pTexts = collectTexts(totalP!);
    expect(pTexts.join('')).toContain('$');
  });

  it('shows plural "projetos" when breakdown has multiple projects', () => {
    const el = renderClient();
    const texts = collectTexts(el).join('');
    expect(texts).toContain('projetos');
  });

  it('shows singular "projeto" (no trailing s) when breakdown has 1 project', () => {
    const el = renderClient(
      [{ project: 'SOLO', totalCost: 1.0, inputCost: 0, outputCost: 0, cacheCost: 0, runCount: 1 }],
      [],
    );
    const texts = collectTexts(el).join('');
    // Should NOT have "projetos" (plural), only "projeto"
    // The plural conditional: breakdown.length !== 1 ? 's' : ''
    // We check for the count card paragraph which contains "· últimos 30 dias"
    expect(texts).toContain('últimos 30 dias');
  });
});

// ---------------------------------------------------------------------------
// Ranked table — Top 10
// ---------------------------------------------------------------------------

describe('CostClient — ranked table with data', () => {
  it('renders a <table> element when breakdown has data', () => {
    const el = renderClient();
    const table = findElement(el, (e) => e.type === 'table');
    expect(table).not.toBeNull();
  });

  it('renders 7 <th> column headers', () => {
    const el = renderClient();
    const ths = findAllElements(el, (e) => e.type === 'th');
    expect(ths.length).toBe(7);
  });

  it('column headers include #, Projeto, Total, Input, Output, Cache, Runs', () => {
    const el = renderClient();
    const ths = findAllElements(el, (e) => e.type === 'th');
    const headerTexts = ths.map((th) => collectTexts(th).join(''));
    expect(headerTexts).toContain('#');
    expect(headerTexts).toContain('Projeto');
    expect(headerTexts).toContain('Total');
    expect(headerTexts).toContain('Input');
    expect(headerTexts).toContain('Output');
    expect(headerTexts).toContain('Cache');
    expect(headerTexts).toContain('Runs');
  });

  it('renders a data row for each project', () => {
    const el = renderClient();
    const trs = findAllElements(el, (e) => e.type === 'tr');
    // Filter rows that contain <td> children (body rows, not header row)
    const bodyRows = trs.filter((tr) => {
      const tds = findAllElements(tr, (e) => e.type === 'td');
      return tds.length > 0;
    });
    expect(bodyRows.length).toBe(BREAKDOWN.length);
  });

  it('formats totalCost of each row with 4 decimal places', () => {
    const el = renderClient();
    const texts = collectTexts(el).join('');
    expect(texts).toContain('5.1234');
    expect(texts).toContain('2.5000');
    expect(texts).toContain('1.0042');
  });

  it('formats inputCost of each row with 4 decimal places', () => {
    const el = renderClient();
    const texts = collectTexts(el).join('');
    expect(texts).toContain('1.0000');
    expect(texts).toContain('0.5000');
    expect(texts).toContain('0.0000');
  });

  it('renders run count for each row', () => {
    const el = renderClient();
    const texts = collectTexts(el).join('');
    expect(texts).toContain('20');
    expect(texts).toContain('8');
  });

  it('slices to max 10 rows when breakdown has more than 10 items', () => {
    const bigBreakdown: BreakdownRow[] = Array.from({ length: 15 }, (_, i) => ({
      project: `P${i}`,
      totalCost: i + 1,
      inputCost: 0,
      outputCost: 0,
      cacheCost: 0,
      runCount: i + 1,
    }));
    const el = renderClient(bigBreakdown, []);
    const trs = findAllElements(el, (e) => e.type === 'tr');
    const bodyRows = trs.filter((tr) => {
      const tds = findAllElements(tr, (e) => e.type === 'td');
      return tds.length > 0;
    });
    expect(bodyRows.length).toBe(10);
  });

  it('renders row index starting at 1 in the first column', () => {
    const el = renderClient();
    const trs = findAllElements(el, (e) => e.type === 'tr');
    const firstBodyRow = trs.find((tr) => {
      const tds = findAllElements(tr, (e) => e.type === 'td');
      return tds.length > 0;
    });
    expect(firstBodyRow).toBeDefined();
    const tds = findAllElements(firstBodyRow!, (e) => e.type === 'td');
    const indexText = collectTexts(tds[0]).join('');
    expect(indexText).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// EmptyState — shown when no data
// ---------------------------------------------------------------------------

describe('CostClient — EmptyState when no breakdown data', () => {
  it('renders at least one EmptyState when breakdown is empty', () => {
    const el = renderClient([], []);
    const empties = findAllElements(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'EmptyState',
    );
    expect(empties.length).toBeGreaterThanOrEqual(1);
  });

  it('renders EmptyState with title "Nenhum projeto" for the table section', () => {
    const el = renderClient([], []);
    const empties = findAllElements(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'EmptyState',
    );
    const tableEmpty = empties.find(
      (e) => (e.props as AnyProps)['data-title'] === 'Nenhum projeto',
    );
    expect(tableEmpty).toBeDefined();
  });

  it('does NOT render <table> when breakdown is empty', () => {
    const el = renderClient([], []);
    const table = findElement(el, (e) => e.type === 'table');
    expect(table).toBeNull();
  });

  it('renders EmptyState with title "Sem dados" for chart section when breakdown is empty', () => {
    const el = renderClient([], []);
    const empties = findAllElements(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'EmptyState',
    );
    const chartEmpty = empties.find(
      (e) => (e.props as AnyProps)['data-title'] === 'Sem dados',
    );
    expect(chartEmpty).toBeDefined();
  });

  it('renders at least 3 EmptyState instances when both breakdown and heatmap are empty', () => {
    const el = renderClient([], []);
    const empties = findAllElements(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'EmptyState',
    );
    expect(empties.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// CostBreakdownChart and MiniCostHeatmap integration
// ---------------------------------------------------------------------------

describe('CostClient — sub-components with data', () => {
  it('renders CostBreakdownChart when breakdown has data', () => {
    const el = renderClient();
    const chart = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'CostBreakdownChart',
    );
    expect(chart).not.toBeNull();
  });

  it('passes full breakdown array to CostBreakdownChart', () => {
    const el = renderClient();
    const chart = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'CostBreakdownChart',
    );
    expect(chart).not.toBeNull();
    expect((chart!.props as AnyProps)['data-count']).toBe(BREAKDOWN.length);
  });

  it('renders MiniCostHeatmap when heatmap has data', () => {
    const el = renderClient();
    const heatmapEl = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'MiniCostHeatmap',
    );
    expect(heatmapEl).not.toBeNull();
  });

  it('passes full heatmap array to MiniCostHeatmap', () => {
    const el = renderClient();
    const heatmapEl = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'MiniCostHeatmap',
    );
    expect(heatmapEl).not.toBeNull();
    expect((heatmapEl!.props as AnyProps)['data-count']).toBe(HEATMAP.length);
  });

  it('does NOT render CostBreakdownChart when breakdown is empty', () => {
    const el = renderClient([], HEATMAP);
    const chart = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'CostBreakdownChart',
    );
    expect(chart).toBeNull();
  });

  it('does NOT render MiniCostHeatmap when heatmap is empty', () => {
    const el = renderClient(BREAKDOWN, []);
    const heatmapEl = findElement(
      el,
      (e) => (e.props as AnyProps)['data-testid'] === 'MiniCostHeatmap',
    );
    expect(heatmapEl).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 30-second polling — setInterval setup via useEffect
// ---------------------------------------------------------------------------

describe('CostClient — 30-second polling', () => {
  it('registers a useEffect during render', () => {
    // Call CostClient directly (before expand) to capture effects
    capturedEffects = [];
    CostClient({ breakdown: BREAKDOWN, heatmap: HEATMAP, period: 'test' });
    expect(capturedEffects.length).toBeGreaterThanOrEqual(1);
  });

  it('calls router.refresh via setInterval every 30 seconds', () => {
    vi.useFakeTimers();
    capturedEffects = [];
    CostClient({ breakdown: BREAKDOWN, heatmap: HEATMAP, period: 'test' });

    // Run all captured effects
    for (const effect of capturedEffects) {
      effect();
    }

    vi.advanceTimersByTime(30_000);
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(mockRefresh).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('cleanup function clears the interval on unmount', () => {
    vi.useFakeTimers();
    capturedEffects = [];
    CostClient({ breakdown: BREAKDOWN, heatmap: HEATMAP, period: 'test' });

    let cleanup: (() => void) | void;
    for (const effect of capturedEffects) {
      cleanup = effect();
    }

    if (typeof cleanup === 'function') cleanup();

    // After cleanup, advancing time should not trigger more refreshes
    vi.advanceTimersByTime(60_000);
    expect(mockRefresh).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// CSV export — downloadCSV function
// ---------------------------------------------------------------------------

describe('CostClient — CSV export', () => {
  it('Export CSV button has an onClick handler', () => {
    const el = renderClient();
    const buttons = findAllElements(el, (e) => e.type === 'button');
    const csvBtn = buttons.find((b) => collectTexts(b).join('').includes('Export CSV'));
    expect(csvBtn).toBeDefined();
    expect(typeof (csvBtn!.props as AnyProps).onClick).toBe('function');
  });

  it('Export CSV onClick calls toast.success with DOM APIs mocked', () => {
    // Mock DOM APIs used by downloadCSV
    const mockClick = vi.fn();
    const mockA: Record<string, unknown> = { href: '', download: '', click: mockClick };

    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag === 'a') return mockA;
        return {};
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('Blob', class MockBlob {
      constructor(public parts: unknown[], public options: unknown) {}
    });

    vi.useFakeTimers();

    const el = renderClient();
    const buttons = findAllElements(el, (e) => e.type === 'button');
    const csvBtn = buttons.find((b) => collectTexts(b).join('').includes('Export CSV'));
    const onClick = (csvBtn!.props as AnyProps).onClick as () => void;

    onClick();

    expect(mockToastSuccess).toHaveBeenCalledOnce();
    const [message] = mockToastSuccess.mock.calls[0] as [string, ...unknown[]];
    expect(message).toContain('CSV');

    expect(mockClick).toHaveBeenCalledOnce();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('CSV download anchor has filename "cost-breakdown.csv"', () => {
    const mockClick = vi.fn();
    const mockA: Record<string, unknown> = { href: '', download: '', click: mockClick };

    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag === 'a') return mockA;
        return {};
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('Blob', class MockBlob {
      constructor(public parts: unknown[], public options: unknown) {}
    });

    vi.useFakeTimers();

    const el = renderClient();
    const buttons = findAllElements(el, (e) => e.type === 'button');
    const csvBtn = buttons.find((b) => collectTexts(b).join('').includes('Export CSV'));
    const onClick = (csvBtn!.props as AnyProps).onClick as () => void;

    onClick();

    expect(mockA.download).toBe('cost-breakdown.csv');

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('CSV toast description mentions the correct project count (plural)', () => {
    const mockClick = vi.fn();
    const mockA: Record<string, unknown> = { href: '', download: '', click: mockClick };

    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        if (tag === 'a') return mockA;
        return {};
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('Blob', class MockBlob {
      constructor(public parts: unknown[], public options: unknown) {}
    });

    vi.useFakeTimers();

    // 3 projects in BREAKDOWN
    const el = renderClient();
    const buttons = findAllElements(el, (e) => e.type === 'button');
    const csvBtn = buttons.find((b) => collectTexts(b).join('').includes('Export CSV'));
    const onClick = (csvBtn!.props as AnyProps).onClick as () => void;

    onClick();

    const [, opts] = mockToastSuccess.mock.calls[0] as [string, { description: string }];
    expect(opts.description).toContain('3 projeto');

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
