/**
 * Unit tests for components/dlq/DLQEventRow.tsx
 *
 * Strategy: call DLQEventRow as a plain function (React element factory),
 * walk the returned tree without a DOM renderer. This mirrors the shell tests.
 * useState is intercepted to inject controlled state per-test.
 *
 * Run:
 *   npx vitest run components/dlq/__tests__/DLQEventRow.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Per-test mutable state injected into useState
// ---------------------------------------------------------------------------

const rowState = {
  reprocessing: false,
  setReprocessing: vi.fn(),
  ignoring: false,
  setIgnoring: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mock @/lib/i18n-context
// ---------------------------------------------------------------------------

vi.mock('@/lib/i18n-context', () => ({
  useI18n: () => ({
    locale: 'en',
    t: {
      dlq: {
        actions: {
          reprocess: 'Reprocess',
          ignore: 'Ignore',
          reprocessing: 'Reprocessing…',
          ignoring: 'Ignoring…',
          copy: 'Copy JSON',
          copied: 'Copied!',
          close: 'Close',
        },
        modal: { title: 'Event Payload' },
        filters: { all_statuses: 'All statuses', all_types: 'All types' },
        status: { dead: 'dead', reprocessed: 'reprocessed', ignored: 'ignored' },
        columns: {
          type: 'Type', status: 'Status', attempts: 'Attempts',
          last_error: 'Last Error', date: 'Date', actions: 'Actions',
        },
        no_events: 'No dead events',
        no_events_desc: 'All webhooks are healthy.',
        load_more: 'Load more',
      },
    },
    toggle: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ui/table — simple passthrough wrappers
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/table', () => ({
  TableRow: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    React.createElement('tr', { className }, children),
  TableCell: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
    React.createElement('td', { className }, children),
  TableHead: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('th', {}, children),
  TableHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('thead', {}, children),
  TableBody: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('tbody', {}, children),
  Table: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('table', {}, children),
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
    children,
    onClick,
    disabled,
    variant,
    size,
  }: {
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler;
    disabled?: boolean;
    variant?: string;
    size?: string;
  }) =>
    React.createElement(
      'button',
      { onClick, disabled, 'data-variant': variant, 'data-size': size },
      children,
    ),
}));

// ---------------------------------------------------------------------------
// Mock sonner
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Mock lucide-react (Loader2 only needed here)
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  Loader2: ({ className }: { className?: string }) =>
    React.createElement('svg', { 'data-icon': 'Loader2', className }),
  Copy: () => React.createElement('svg', { 'data-icon': 'Copy' }),
  X: () => React.createElement('svg', { 'data-icon': 'X' }),
}));

// ---------------------------------------------------------------------------
// Mock @/components/ui/sheet — SheetTrigger renders its children directly
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-sheet': '' }, children),
  SheetTrigger: ({ children }: { children?: React.ReactNode; asChild?: boolean }) =>
    React.createElement('div', { 'data-sheet-trigger': '' }, children),
  SheetContent: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-sheet-content': '' }, children),
  SheetHeader: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-sheet-header': '' }, children),
  SheetTitle: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('h2', { 'data-sheet-title': '' }, children),
  SheetClose: ({ children }: { children?: React.ReactNode; asChild?: boolean }) =>
    React.createElement('div', { 'data-sheet-close': '' }, children),
}));

// ---------------------------------------------------------------------------
// Mock React.useState to inject controlled state
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

import { DLQEventRow } from '../DLQEventRow';
import type { DLQEvent } from '../DLQEventRow';

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
// useState mock setup — two calls per render: reprocessing + ignoring
// ---------------------------------------------------------------------------

function setupUseState({
  reprocessing = false,
  ignoring = false,
}: { reprocessing?: boolean; ignoring?: boolean } = {}) {
  let callCount = 0;
  vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
    callCount++;
    if (callCount === 1) return [reprocessing, rowState.setReprocessing];
    if (callCount === 2) return [ignoring, rowState.setIgnoring];
    return [initial, vi.fn()];
  }) as typeof React.useState);
}

beforeEach(() => {
  rowState.setReprocessing.mockReset();
  rowState.setIgnoring.mockReset();
  // default: not loading
  setupUseState();
});

// ===========================================================================
// TESTS
// ===========================================================================

describe('DLQEventRow — renders hookType and status badge', () => {
  it('renders hookType text in a cell', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent(), onUpdate }) as React.ReactElement;
    expect(flattenText(expand(el))).toContain('github.push');
  });

  it('renders status badge with correct variant for dead', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ status: 'dead' }), onUpdate }) as React.ReactElement;
    const badge = findInExpanded(el, (e) => e.type === 'span' && e.props['data-variant'] === 'fail');
    expect(badge).not.toBeNull();
    expect(flattenText(badge)).toBe('dead');
  });

  it('renders status badge with variant pass for reprocessed', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ status: 'reprocessed' }), onUpdate }) as React.ReactElement;
    const badge = findInExpanded(el, (e) => e.type === 'span' && e.props['data-variant'] === 'pass');
    expect(badge).not.toBeNull();
  });

  it('renders status badge with variant unknown for ignored', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ status: 'ignored' }), onUpdate }) as React.ReactElement;
    const badge = findInExpanded(el, (e) => e.type === 'span' && e.props['data-variant'] === 'unknown');
    expect(badge).not.toBeNull();
  });
});

describe('DLQEventRow — action buttons visibility', () => {
  it('shows Reprocess and Ignore buttons when status is dead', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ status: 'dead' }), onUpdate }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).toContain('Reprocess');
    expect(text).toContain('Ignore');
  });

  it('hides action buttons when status is reprocessed', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ status: 'reprocessed' }), onUpdate }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).not.toContain('Reprocess');
    expect(text).not.toContain('Ignore');
  });

  it('hides action buttons when status is ignored', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ status: 'ignored' }), onUpdate }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).not.toContain('Reprocess');
    expect(text).not.toContain('Ignore');
  });
});

describe('DLQEventRow — onUpdate calls', () => {
  it('calls onUpdate with "dead" when Reprocess button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent(), onUpdate }) as React.ReactElement;
    // Find the Reprocess button: text is exactly "Reprocess" (not "Reprocessing")
    const reprocessBtn = findInExpanded(
      el,
      (e) => e.type === 'button' && flattenText(e) === 'Reprocess',
    );
    expect(reprocessBtn).not.toBeNull();

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    await reprocessBtn!.props.onClick(fakeEvent);

    expect(onUpdate).toHaveBeenCalledWith('evt-1', 'dead');
  });

  it('calls onUpdate with "ignored" when Ignore button is clicked', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent(), onUpdate }) as React.ReactElement;
    // Find the Ignore button: text is exactly "Ignore"
    const ignoreBtn = findInExpanded(
      el,
      (e) => e.type === 'button' && flattenText(e) === 'Ignore',
    );
    expect(ignoreBtn).not.toBeNull();

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    await ignoreBtn!.props.onClick(fakeEvent);

    expect(onUpdate).toHaveBeenCalledWith('evt-1', 'ignored');
  });
});

describe('DLQEventRow — revert on fetch failure', () => {
  it('calls onUpdate twice (optimistic then revert) when reprocess fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;
    const onUpdate = vi.fn();
    const event = makeEvent({ status: 'dead' });
    const el = DLQEventRow({ event, onUpdate }) as React.ReactElement;
    const reprocessBtn = findInExpanded(
      el,
      (e) => e.type === 'button' && flattenText(e) === 'Reprocess',
    );
    expect(reprocessBtn).not.toBeNull();

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    await reprocessBtn!.props.onClick(fakeEvent);

    // First call: optimistic update to 'dead'
    expect(onUpdate).toHaveBeenNthCalledWith(1, 'evt-1', 'dead');
    // Second call: revert to original status (was 'dead', so reverts to 'dead')
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'evt-1', 'dead');
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('calls onUpdate twice (optimistic then revert) when ignore fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch;
    const onUpdate = vi.fn();
    const event = makeEvent({ status: 'dead' });
    const el = DLQEventRow({ event, onUpdate }) as React.ReactElement;
    const ignoreBtn = findInExpanded(
      el,
      (e) => e.type === 'button' && flattenText(e) === 'Ignore',
    );
    expect(ignoreBtn).not.toBeNull();

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    await ignoreBtn!.props.onClick(fakeEvent);

    expect(onUpdate).toHaveBeenNthCalledWith(1, 'evt-1', 'ignored');
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'evt-1', 'dead');
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('calls onUpdate twice when fetch returns non-ok response for reprocess', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const onUpdate = vi.fn();
    const event = makeEvent({ status: 'dead' });
    const el = DLQEventRow({ event, onUpdate }) as React.ReactElement;
    const reprocessBtn = findInExpanded(
      el,
      (e) => e.type === 'button' && flattenText(e) === 'Reprocess',
    );
    expect(reprocessBtn).not.toBeNull();

    const fakeEvent = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;
    await reprocessBtn!.props.onClick(fakeEvent);

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'evt-1', 'dead');
  });
});

describe('DLQEventRow — loading state (disabled buttons)', () => {
  it('both buttons are disabled when reprocessing is true', () => {
    setupUseState({ reprocessing: true, ignoring: false });
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent(), onUpdate }) as React.ReactElement;
    const expanded = expand(el);
    const buttons: React.ReactElement[] = [];
    function collectButtons(node: React.ReactNode): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(collectButtons); return; }
      const e = node as React.ReactElement;
      if (e.type === 'button') buttons.push(e);
      if (e.props?.children) collectButtons(e.props.children);
    }
    collectButtons(expanded);
    // When reprocessing=true, should have buttons (Reprocessing… + Ignore)
    const actionButtons = buttons.filter(
      (b) => flattenText(b).includes('Reprocessing') || flattenText(b).includes('Ignore'),
    );
    expect(actionButtons.length).toBeGreaterThan(0);
    for (const btn of actionButtons) {
      expect(btn.props.disabled).toBe(true);
    }
  });

  it('both buttons are disabled when ignoring is true', () => {
    setupUseState({ reprocessing: false, ignoring: true });
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent(), onUpdate }) as React.ReactElement;
    const expanded = expand(el);
    const buttons: React.ReactElement[] = [];
    function collectButtons(node: React.ReactNode): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(collectButtons); return; }
      const e = node as React.ReactElement;
      if (e.type === 'button') buttons.push(e);
      if (e.props?.children) collectButtons(e.props.children);
    }
    collectButtons(expanded);
    // When ignoring=true, should have buttons (Reprocess + Ignoring…)
    const actionButtons = buttons.filter(
      (b) => flattenText(b).includes('Reprocess') || flattenText(b).includes('Ignoring'),
    );
    expect(actionButtons.length).toBeGreaterThan(0);
    for (const btn of actionButtons) {
      expect(btn.props.disabled).toBe(true);
    }
  });

  it('shows "Reprocessing…" label when reprocessing is true', () => {
    setupUseState({ reprocessing: true, ignoring: false });
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent(), onUpdate }) as React.ReactElement;
    expect(flattenText(expand(el))).toContain('Reprocessing…');
  });

  it('shows "Ignoring…" label when ignoring is true', () => {
    setupUseState({ reprocessing: false, ignoring: true });
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent(), onUpdate }) as React.ReactElement;
    expect(flattenText(expand(el))).toContain('Ignoring…');
  });
});

describe('DLQEventRow — error message truncation', () => {
  it('shows full error message when <= 60 chars', () => {
    const msg = 'Connection refused';
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ errorMessage: msg }), onUpdate }) as React.ReactElement;
    expect(flattenText(expand(el))).toContain(msg);
  });

  it('truncates error message to 60 chars with ellipsis when > 60 chars', () => {
    const longMsg = 'A'.repeat(80);
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ errorMessage: longMsg }), onUpdate }) as React.ReactElement;
    const text = flattenText(expand(el));
    expect(text).toContain('A'.repeat(60) + '…');
    expect(text).not.toContain('A'.repeat(61));
  });

  it('shows "—" when errorMessage is null', () => {
    const onUpdate = vi.fn();
    const el = DLQEventRow({ event: makeEvent({ errorMessage: null }), onUpdate }) as React.ReactElement;
    expect(flattenText(expand(el))).toContain('—');
  });
});
