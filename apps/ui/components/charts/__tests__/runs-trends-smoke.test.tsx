// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck — complex React hook mocking pattern; runtime verified by vitest
/**
 * Unit smoke tests — Tendências section components (MOB-1068)
 *
 * Validates TrendChart, GateFunnelChart, and GranularityToggle render the
 * correct element structure and text without a DOM renderer.
 *
 * Strategy mirrors shell.test.tsx:
 *   - Mock React hooks (useState, useEffect) to control state
 *   - Call component functions directly and walk the React element tree
 *   - No network calls — fetch is mocked to a no-op
 *
 * Run from monorepo root:
 *   npx vitest run --pool=threads apps/ui/components/charts/__tests__/runs-trends-smoke.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Per-test mutable state
// ---------------------------------------------------------------------------

/** Controls what useState returns for `granularity` (first useState call). */
const mockGranularity = { current: 'day' as string };
/** Controls what useState returns for `loading`. */
const mockLoading = { current: true };
/** Controls what useState returns for `error`. */
const mockError = { current: false };
/** Controls what useState returns for `data`. */
const mockData = { current: [] as unknown[] };

// ---------------------------------------------------------------------------
// Mock React hooks — intercept useState so components work outside renderer
// ---------------------------------------------------------------------------

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof React>();
  return {
    ...actual,
    useState: vi.fn(),
    useEffect: vi.fn(),
    useCallback: vi.fn((fn: unknown) => fn),
    useMemo: vi.fn((fn: () => unknown) => fn()),
    createElement: actual.createElement,
    Fragment: actual.Fragment,
    forwardRef: actual.forwardRef,
  };
});

// ---------------------------------------------------------------------------
// Mock recharts — lightweight stubs so the JSX compiles without a browser
// ---------------------------------------------------------------------------

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'line-chart' }, children),
  BarChart: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  Line: () => React.createElement('div', { 'data-testid': 'line' }),
  Bar: () => React.createElement('div', { 'data-testid': 'bar' }),
  XAxis: () => React.createElement('div', { 'data-testid': 'xaxis' }),
  YAxis: () => React.createElement('div', { 'data-testid': 'yaxis' }),
  CartesianGrid: () => React.createElement('div', { 'data-testid': 'grid' }),
  Tooltip: () => React.createElement('div', { 'data-testid': 'tooltip' }),
  Legend: () => React.createElement('div', { 'data-testid': 'legend' }),
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'responsive-container' }, children),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ui/skeleton
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) =>
    React.createElement('div', { 'data-testid': 'skeleton', className }),
}));

// ---------------------------------------------------------------------------
// Mock next-intl — components use useTranslations; mock it to return a
// simple key-passthrough function so tests work without a provider
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => {
  const msgs: Record<string, Record<string, string>> = {
    'gantt.granularity': { hour: 'hora', day: 'dia', week: 'semana', month: 'mês' },
    'charts': { load_error: 'Falha ao carregar dados.', no_data: 'Sem dados para o período selecionado.', export_csv: 'Exportar CSV' },
  };
  return {
    useTranslations: (ns: string) => (key: string) => msgs[ns]?.[key] ?? key,
  };
});

// ---------------------------------------------------------------------------
// Mock fetch — charts call fetch on mount via useEffect; effect is mocked
// so fetch is never actually invoked, but stub it anyway for safety
// ---------------------------------------------------------------------------

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));

// ---------------------------------------------------------------------------
// Import components AFTER mocks are set up
// ---------------------------------------------------------------------------

import { TrendChart, type LineConfig } from '../TrendChart';
import { GateFunnelChart } from '../GateFunnelChart';
import { GranularityToggle } from '../chart-utils';

// ---------------------------------------------------------------------------
// Tree-walking helpers (same pattern as shell.test.tsx)
// ---------------------------------------------------------------------------

function expand(node: React.ReactNode, depth = 0): React.ReactNode {
  if (depth > 20) return node;
  if (node === null || node === undefined || typeof node === 'boolean') return node;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map((n) => expand(n, depth));
  const el = node as React.ReactElement;
  if (!el || typeof el !== 'object' || !('type' in el)) return node;
  if (typeof el.type === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rendered = (el.type as React.FC<any>)(el.props ?? {});
      return expand(rendered, depth + 1);
    } catch {
      if (el.props?.children) {
        return React.createElement(
          el.type as string,
          el.props,
          expand(el.props.children, depth + 1),
        );
      }
      return el;
    }
  }
  if (el.props?.children) {
    return React.cloneElement(el, {}, expand(el.props.children, depth + 1));
  }
  return el;
}

function flattenText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  const el = node as React.ReactElement;
  if (el?.props) return flattenText(el.props.children);
  return '';
}

type ElementPredicate = (el: React.ReactElement) => boolean;

function findElement(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, pred);
      if (found) return found;
    }
    return null;
  }
  const el = node as React.ReactElement;
  if (pred(el)) return el;
  if (el.props?.children) return findElement(el.props.children, pred);
  return null;
}

function findAllElements(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement[] {
  const results: React.ReactElement[] = [];
  function walk(n: React.ReactNode): void {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const el = n as React.ReactElement;
    if (pred(el)) results.push(el);
    if (el.props?.children) walk(el.props.children);
  }
  walk(node);
  return results;
}

// ---------------------------------------------------------------------------
// useState mock setup helper
// ---------------------------------------------------------------------------

/**
 * Configure the mocked React.useState to return values in call order.
 * Components call useState in this sequence:
 *   TrendChart:      granularity, data, loading, error
 *   GateFunnelChart: granularity, data, loading, error
 */
function setupUseState(
  granularity: string,
  data: unknown[],
  loading: boolean,
  error: boolean,
) {
  const setters = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
  let callCount = 0;
  vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
    const idx = callCount++;
    if (idx === 0) return [granularity, setters[0]];
    if (idx === 1) return [data, setters[1]];
    if (idx === 2) return [loading, setters[2]];
    if (idx === 3) return [error, setters[3]];
    return [initial, vi.fn()];
  }) as typeof React.useState);
  vi.mocked(React.useEffect).mockImplementation(vi.fn());
}

// ---------------------------------------------------------------------------
// Shared FINDINGS_LINES fixture (same as runs/page.tsx)
// ---------------------------------------------------------------------------

const FINDINGS_LINES: LineConfig[] = [
  { dataKey: 'critical', stroke: '#DC2626', name: 'Critical' },
  { dataKey: 'high', stroke: '#F97316', name: 'High' },
  { dataKey: 'medium', stroke: '#EAB308', name: 'Medium' },
  { dataKey: 'low', stroke: '#22C55E', name: 'Low' },
];

// ---------------------------------------------------------------------------
// beforeEach reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockGranularity.current = 'day';
  mockLoading.current = true;
  mockError.current = false;
  mockData.current = [];
});

// ===========================================================================
// GranularityToggle — exported from chart-utils
// ===========================================================================

describe('GranularityToggle — structure', () => {
  it('exports GranularityToggle as a function', () => {
    expect(typeof GranularityToggle).toBe('function');
  });

  it('renders a wrapping div', () => {
    const el = GranularityToggle({ value: 'day', onChange: vi.fn() }) as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('renders exactly 4 buttons (hora, dia, semana, mês)', () => {
    const el = GranularityToggle({ value: 'day', onChange: vi.fn() }) as React.ReactElement;
    const expanded = expand(el);
    const buttons = findAllElements(
      expanded,
      (e) => e.type === 'button',
    );
    expect(buttons).toHaveLength(4);
  });

  it('button text values match i18n translations (via mock)', () => {
    const el = GranularityToggle({ value: 'day', onChange: vi.fn() }) as React.ReactElement;
    const text = flattenText(el);
    // The component uses useTranslations with the mocked pt-BR values.
    // Assert that each mocked translation label appears in the rendered tree.
    const mockLabels = ['hora', 'dia', 'semana', 'mês'];
    for (const label of mockLabels) {
      expect(text, `expected text to contain "${label}"`).toContain(label);
    }
  });

  it('contains "hora" button text', () => {
    const el = GranularityToggle({ value: 'hour', onChange: vi.fn() }) as React.ReactElement;
    expect(flattenText(el)).toContain('hora');
  });

  it('contains "dia" button text', () => {
    const el = GranularityToggle({ value: 'day', onChange: vi.fn() }) as React.ReactElement;
    expect(flattenText(el)).toContain('dia');
  });

  it('contains "semana" button text', () => {
    const el = GranularityToggle({ value: 'week', onChange: vi.fn() }) as React.ReactElement;
    expect(flattenText(el)).toContain('semana');
  });

  it('contains "mês" button text', () => {
    const el = GranularityToggle({ value: 'month', onChange: vi.fn() }) as React.ReactElement;
    expect(flattenText(el)).toContain('mês');
  });

  it('active button (value === g) has bg-forja-bg-elevated class (active style)', () => {
    const el = GranularityToggle({ value: 'week', onChange: vi.fn() }) as React.ReactElement;
    const expanded = expand(el);
    // The active button has bg-forja-bg-elevated; inactive buttons do not
    const activeBtn = findElement(
      expanded,
      (e) =>
        e.type === 'button' &&
        typeof e.props?.className === 'string' &&
        e.props.className.includes('bg-forja-bg-elevated'),
    );
    expect(activeBtn).not.toBeNull();
    expect(flattenText(activeBtn)).toBe('semana');
  });

  it('inactive buttons do not have bg-forja-bg-elevated class', () => {
    const el = GranularityToggle({ value: 'day', onChange: vi.fn() }) as React.ReactElement;
    const expanded = expand(el);
    const allButtons = findAllElements(expanded, (e) => e.type === 'button');
    const inactiveButtons = allButtons.filter((b) => flattenText(b) !== 'dia');
    for (const btn of inactiveButtons) {
      expect(btn.props?.className ?? '').not.toContain('bg-forja-bg-elevated');
    }
  });

  it('clicking a button calls onChange with its granularity value', () => {
    const onChange = vi.fn();
    const el = GranularityToggle({ value: 'day', onChange }) as React.ReactElement;
    const expanded = expand(el);
    const weekBtn = findElement(
      expanded,
      (e) => e.type === 'button' && flattenText(e) === 'semana',
    );
    expect(weekBtn).not.toBeNull();
    weekBtn!.props.onClick();
    expect(onChange).toHaveBeenCalledWith('week');
  });
});

// ===========================================================================
// TrendChart
// ===========================================================================

describe('TrendChart — exports', () => {
  it('exports TrendChart as a function', () => {
    expect(typeof TrendChart).toBe('function');
  });
});

describe('TrendChart — loading state', () => {
  beforeEach(() => {
    setupUseState('day', [], true, false);
  });

  it('renders a root div', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('renders the title "Findings por Severidade"', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    expect(flattenText(el)).toContain('Findings por Severidade');
  });

  it('renders title in a <span> element', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    const titleSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Findings por Severidade',
    );
    expect(titleSpan).not.toBeNull();
  });

  it('renders a Skeleton while loading', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    const expanded = expand(el);
    const skeleton = findElement(
      expanded,
      (e) =>
        e.type === 'div' &&
        typeof e.props?.['data-testid'] === 'string' &&
        e.props['data-testid'] === 'skeleton',
    );
    expect(skeleton).not.toBeNull();
  });

  it('renders the GranularityToggle (has "dia" button) while loading', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    // GranularityToggle is a function component — expand the tree first
    expect(flattenText(expand(el))).toContain('dia');
  });

  it('registers a useEffect for data fetching', () => {
    TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    });
    expect(vi.mocked(React.useEffect)).toHaveBeenCalled();
  });
});

describe('TrendChart — error state', () => {
  beforeEach(() => {
    setupUseState('day', [], false, true);
  });

  it('shows error message when error=true and loading=false', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    expect(flattenText(el)).toContain('Falha ao carregar dados');
  });
});

describe('TrendChart — empty data state', () => {
  beforeEach(() => {
    setupUseState('day', [], false, false);
  });

  it('shows empty-state message when data is empty and not loading', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    expect(flattenText(el)).toContain('Sem dados para o período selecionado');
  });
});

describe('TrendChart — Exportar CSV button', () => {
  beforeEach(() => {
    setupUseState('day', [], true, false);
  });

  it('renders "Exportar CSV" button', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    expect(flattenText(el)).toContain('Exportar CSV');
  });

  it('Exportar CSV is a <button> element', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Findings por Severidade',
    }) as React.ReactElement;
    const btn = findElement(
      el,
      (e) => e.type === 'button' && flattenText(e) === 'Exportar CSV',
    );
    expect(btn).not.toBeNull();
  });
});

describe('TrendChart — custom title prop', () => {
  beforeEach(() => {
    setupUseState('day', [], true, false);
  });

  it('renders any arbitrary title passed via prop', () => {
    const el = TrendChart({
      metric: 'findings',
      lines: FINDINGS_LINES,
      title: 'Custom Title Test',
    }) as React.ReactElement;
    expect(flattenText(el)).toContain('Custom Title Test');
  });
});

// ===========================================================================
// GateFunnelChart
// ===========================================================================

describe('GateFunnelChart — exports', () => {
  it('exports GateFunnelChart as a function', () => {
    expect(typeof GateFunnelChart).toBe('function');
  });
});

describe('GateFunnelChart — loading state', () => {
  beforeEach(() => {
    setupUseState('day', [], true, false);
  });

  it('renders a root div', () => {
    const el = GateFunnelChart({ title: 'Taxa de Gate' }) as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('renders the title "Taxa de Gate"', () => {
    const el = GateFunnelChart({ title: 'Taxa de Gate' }) as React.ReactElement;
    expect(flattenText(el)).toContain('Taxa de Gate');
  });

  it('title is rendered in a <span> element', () => {
    const el = GateFunnelChart({ title: 'Taxa de Gate' }) as React.ReactElement;
    const titleSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Taxa de Gate',
    );
    expect(titleSpan).not.toBeNull();
  });

  it('renders a Skeleton while loading', () => {
    const el = GateFunnelChart({ title: 'Taxa de Gate' }) as React.ReactElement;
    const expanded = expand(el);
    const skeleton = findElement(
      expanded,
      (e) =>
        e.type === 'div' &&
        typeof e.props?.['data-testid'] === 'string' &&
        e.props['data-testid'] === 'skeleton',
    );
    expect(skeleton).not.toBeNull();
  });

  it('renders the GranularityToggle (has all 4 buttons)', () => {
    const el = GateFunnelChart({ title: 'Taxa de Gate' }) as React.ReactElement;
    // GranularityToggle is a function component — expand the tree first
    const text = flattenText(expand(el));
    expect(text).toContain('hora');
    expect(text).toContain('dia');
    expect(text).toContain('semana');
    expect(text).toContain('mês');
  });

  it('registers a useEffect for data fetching', () => {
    GateFunnelChart({ title: 'Taxa de Gate' });
    expect(vi.mocked(React.useEffect)).toHaveBeenCalled();
  });
});

describe('GateFunnelChart — error state', () => {
  beforeEach(() => {
    setupUseState('day', [], false, true);
  });

  it('shows error message when error=true and loading=false', () => {
    const el = GateFunnelChart({ title: 'Taxa de Gate' }) as React.ReactElement;
    expect(flattenText(el)).toContain('Falha ao carregar dados');
  });
});

describe('GateFunnelChart — empty data state', () => {
  beforeEach(() => {
    setupUseState('day', [], false, false);
  });

  it('shows empty-state message when data is empty', () => {
    const el = GateFunnelChart({ title: 'Taxa de Gate' }) as React.ReactElement;
    expect(flattenText(el)).toContain('Sem dados para o período selecionado');
  });
});

describe('GateFunnelChart — omitted title', () => {
  beforeEach(() => {
    setupUseState('day', [], true, false);
  });

  it('renders without a title when prop is omitted', () => {
    const el = GateFunnelChart({}) as React.ReactElement;
    expect(el.type).toBe('div');
  });
});
