/**
 * Unit tests for components/dlq/DLQClient.tsx
 *
 * Strategy: call DLQClient as a plain function, walk the returned element tree.
 * useState is intercepted to inject controlled state per-test.
 *
 * Run:
 *   npx vitest run components/dlq/__tests__/DLQClient.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Per-test mutable state for useState interception
// ---------------------------------------------------------------------------

const clientState = {
  events: [] as DLQEvent[],
  setEvents: vi.fn(),
  loading: false,
  setLoading: vi.fn(),
};

type DLQEvent = {
  id: string;
  hookType: string;
  payload: unknown;
  errorMessage: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  createdAt: string;
  status: 'dead' | 'reprocessed' | 'ignored';
};

// ---------------------------------------------------------------------------
// Mock @/lib/i18n-context
// ---------------------------------------------------------------------------

vi.mock('@/lib/i18n-context', () => ({
  useI18n: () => ({
    locale: 'en',
    t: {
      dlq: {
        title: 'Dead Letter Queue',
        no_events: 'No dead events',
        no_events_desc: 'All webhooks are healthy.',
        load_more: 'Load more',
        columns: {
          type: 'Type', status: 'Status', attempts: 'Attempts',
          last_error: 'Last Error', date: 'Date', actions: 'Actions',
        },
        status: { dead: 'dead', reprocessed: 'reprocessed', ignored: 'ignored' },
        actions: {
          reprocess: 'Reprocess', ignore: 'Ignore',
          copy: 'Copy JSON', close: 'Close',
          reprocessing: 'Reprocessing…', ignoring: 'Ignoring…', copied: 'Copied!',
        },
        modal: { title: 'Event Payload' },
        filters: { all_statuses: 'All statuses', all_types: 'All types' },
      },
    },
    toggle: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ui/table
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('table', {}, children),
  TableHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('thead', {}, children),
  TableBody: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('tbody', {}, children),
  TableHead: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('th', {}, children),
  TableRow: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    React.createElement('tr', { className }, children),
  TableCell: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    React.createElement('td', { className }, children),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ui/badge
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children?: React.ReactNode; variant?: string }) =>
    React.createElement('span', { 'data-variant': variant }, children),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ui/button
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children, onClick, disabled, variant,
  }: {
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler;
    disabled?: boolean;
    variant?: string;
  }) =>
    React.createElement('button', { onClick, disabled, 'data-variant': variant }, children),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ui/sheet
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-sheet': '' }, children),
  SheetTrigger: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-sheet-trigger': '' }, children),
  SheetContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-sheet-content': '' }, children),
  SheetHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', {}, children),
  SheetTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('h2', {}, children),
  SheetClose: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', {}, children),
}));

// ---------------------------------------------------------------------------
// Mock sonner
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock lucide-react
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'Loader2', className }),
  Copy: () => React.createElement('svg', { 'data-icon': 'Copy' }),
  X: () => React.createElement('svg', { 'data-icon': 'X' }),
}));

// ---------------------------------------------------------------------------
// Mock React.useState
// ---------------------------------------------------------------------------

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof React>();
  return {
    ...actual,
    useState: vi.fn(),
    createElement: actual.createElement,
    Fragment: actual.Fragment,
    forwardRef: actual.forwardRef,
  };
});

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import { DLQClient } from '../DLQClient';

// ---------------------------------------------------------------------------
// Tree helpers — expand function components so we can walk the full tree
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
          el.type as unknown as string,
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

/** Find element in the expanded (fully rendered) tree. */
function findInExpanded(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement | null {
  return findElement(expand(node), pred);
}

function findAll(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement[] {
  const results: React.ReactElement[] = [];
  function walk(n: React.ReactNode): void {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const e = n as React.ReactElement;
    if (pred(e)) results.push(e);
    if (e.props?.children) walk(e.props.children);
  }
  walk(node);
  return results;
}

/** Find all in expanded tree. */
function findAllInExpanded(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement[] {
  return findAll(expand(node), pred);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<DLQEvent> = {}): DLQEvent {
  return {
    id: 'evt-1',
    hookType: 'github.push',
    payload: { ref: 'refs/heads/main' },
    errorMessage: 'Connection refused',
    attempts: 3,
    lastAttemptAt: '2024-01-15T10:00:00Z',
    createdAt: '2024-01-14T08:00:00Z',
    status: 'dead',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// useState setup — DLQClient has two useState calls: events + loading
// ---------------------------------------------------------------------------

function setupUseState(events: DLQEvent[], loading = false) {
  clientState.events = events;
  clientState.loading = loading;
  let callCount = 0;
  vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
    callCount++;
    if (callCount === 1) return [events, clientState.setEvents];
    if (callCount === 2) return [loading, clientState.setLoading];
    return [initial, vi.fn()];
  }) as typeof React.useState);
}

beforeEach(() => {
  clientState.setEvents.mockReset();
  clientState.setLoading.mockReset();
  setupUseState([]);
});

// ===========================================================================
// TESTS
// ===========================================================================

describe('DLQClient — empty state', () => {
  it('renders empty state text when events is empty', () => {
    setupUseState([]);
    const el = DLQClient({
      initialEvents: [],
      totalCount: 0,
    }) as React.ReactElement;
    expect(flattenText(el)).toContain('No dead events');
  });

  it('renders empty state description when events is empty', () => {
    setupUseState([]);
    const el = DLQClient({
      initialEvents: [],
      totalCount: 0,
    }) as React.ReactElement;
    expect(flattenText(el)).toContain('All webhooks are healthy.');
  });

  it('does not render a table when events is empty', () => {
    setupUseState([]);
    const el = DLQClient({
      initialEvents: [],
      totalCount: 0,
    }) as React.ReactElement;
    const table = findInExpanded(el, (e) => e.type === 'table');
    expect(table).toBeNull();
  });
});

describe('DLQClient — table with rows', () => {
  it('renders a table when events are provided', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;
    const table = findInExpanded(el, (e) => e.type === 'table');
    expect(table).not.toBeNull();
  });

  it('renders table headers (Type, Status, Attempts, Last Error, Date, Actions)', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).toContain('Type');
    expect(text).toContain('Status');
    expect(text).toContain('Attempts');
    expect(text).toContain('Last Error');
    expect(text).toContain('Date');
    expect(text).toContain('Actions');
  });

  it('renders hookType of each event in the table', () => {
    const events = [
      makeEvent({ id: 'evt-1', hookType: 'github.push' }),
      makeEvent({ id: 'evt-2', hookType: 'linear.issue.created' }),
    ];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 2,
    }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).toContain('github.push');
    expect(text).toContain('linear.issue.created');
  });
});

describe('DLQClient — filter dropdowns', () => {
  it('renders a status filter select', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;
    const selects = findAllInExpanded(el, (e) => e.type === 'select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it('status filter shows all statuses option', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;
    expect(flattenText(expand(el))).toContain('All statuses');
  });

  it('hookType filter shows all types option', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;
    expect(flattenText(expand(el))).toContain('All types');
  });

  it('currentStatus prop is pre-selected in status filter', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
      currentStatus: 'dead',
    }) as React.ReactElement;
    const selects = findAllInExpanded(el, (e) => e.type === 'select');
    const statusSelect = selects[0];
    expect(statusSelect).not.toBeNull();
    expect(statusSelect.props.value).toBe('dead');
  });

  it('hookType filter includes hookTypes from loaded events as options', () => {
    const events = [
      makeEvent({ id: 'e1', hookType: 'github.push' }),
      makeEvent({ id: 'e2', hookType: 'linear.issue' }),
    ];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 2,
    }) as React.ReactElement;
    const options = findAllInExpanded(el, (e) => e.type === 'option' && e.props.value === 'github.push');
    expect(options.length).toBeGreaterThan(0);
  });
});

describe('DLQClient — Load more button', () => {
  it('shows "Load more" button when there are more events to load (totalCount > events.length)', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 10,
    }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).toContain('Load more');
  });

  it('hides "Load more" button when all events are loaded (totalCount == events.length)', () => {
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).not.toContain('Load more');
  });

  it('Load more button is disabled when loading is true', () => {
    const events = [makeEvent()];
    setupUseState(events, true);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 10,
    }) as React.ReactElement;
    const loadMoreBtn = findInExpanded(
      el,
      (e) => e.type === 'button' && flattenText(e).includes('Load more'),
    );
    expect(loadMoreBtn).not.toBeNull();
    expect(loadMoreBtn!.props.disabled).toBe(true);
  });

  it('Load more button is enabled when loading is false', () => {
    const events = [makeEvent()];
    setupUseState(events, false);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 10,
    }) as React.ReactElement;
    const loadMoreBtn = findInExpanded(
      el,
      (e) => e.type === 'button' && flattenText(e).includes('Load more'),
    );
    expect(loadMoreBtn).not.toBeNull();
    expect(loadMoreBtn!.props.disabled).toBe(false);
  });
});

describe('DLQClient — onUpdate callback propagates to row state', () => {
  it('setEvents is called when handleUpdate is invoked internally', () => {
    // We test this by checking the component wires DLQEventRow with an onUpdate handler.
    // Since DLQEventRow is rendered as a function component element, we can find it in
    // the tree and verify the onUpdate prop is a function.
    const events = [makeEvent()];
    setupUseState(events);
    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;

    // DLQEventRow is rendered as a function element — its type is a function
    const rowEl = findElement(
      el,
      (e) => typeof e.type === 'function' && (e.type as { displayName?: string; name?: string }).name === 'DLQEventRow',
    );
    expect(rowEl).not.toBeNull();
    expect(typeof rowEl!.props.onUpdate).toBe('function');
  });

  it('calling onUpdate triggers setEvents with updated status', () => {
    const events = [makeEvent({ id: 'evt-1', status: 'dead' })];
    let _capturedSetEvents: ((fn: (prev: DLQEvent[]) => DLQEvent[]) => void) | null = null;

    let callCount = 0;
    vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
      callCount++;
      if (callCount === 1) {
        const setter = (fn: (prev: DLQEvent[]) => DLQEvent[]) => {
          _capturedSetEvents = setter;
          // Call fn to verify behavior
          const result = fn(events);
          clientState.events = result;
        };
        clientState.setEvents = setter as unknown as typeof clientState.setEvents;
        return [events, setter];
      }
      if (callCount === 2) return [false, clientState.setLoading];
      return [initial, vi.fn()];
    }) as typeof React.useState);

    const el = DLQClient({
      initialEvents: events,
      totalCount: 1,
    }) as React.ReactElement;

    const rowEl = findElement(
      el,
      (e) => typeof e.type === 'function' && (e.type as { name?: string }).name === 'DLQEventRow',
    );
    expect(rowEl).not.toBeNull();

    // Simulate an onUpdate call: update event status to 'ignored'
    rowEl!.props.onUpdate('evt-1', 'ignored');

    // Verify the state was updated
    expect(clientState.events[0].status).toBe('ignored');
  });
});
