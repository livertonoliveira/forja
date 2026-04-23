/**
 * Unit tests for apps/ui/components/shell/ (MOB-1099)
 *
 * Tests without DOM rendering — validates element trees, class names,
 * localStorage interaction, and component structure.
 *
 * Strategy:
 * - Mock React hooks (useState, useEffect) to control state without a renderer
 * - Mock next/navigation, next/link (as passthrough ref to detect href), lucide-react
 * - Call component functions directly to obtain React element trees
 * - Walk trees with helpers that understand both host elements ('a','button') and
 *   function-component elements (mocked Link whose jsx type is the mock fn)
 *
 * Run from monorepo root:
 *   npx vitest run --pool=threads apps/ui/components/shell/__tests__/shell.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mutable per-test state — set in beforeEach before each component call
// ---------------------------------------------------------------------------

/** Sidebar collapsed state — mutated per test. */
const sidebarState = {
  collapsed: false,
  setCollapsed: vi.fn(),
};

/** usePathname return value. */
const mockPathname = { current: '/' };

/** useSelectedLayoutSegments return value. */
const mockSegments = { current: [] as string[] };

// ---------------------------------------------------------------------------
// Mock next/link — a function component that passes href/className/title props.
// When walking the element tree, Link elements have `type = function` and `props.href`.
// findLinkByHref() matches on typeof type === 'function' && props.href.
// ---------------------------------------------------------------------------

vi.mock('next/link', () => {
  const LinkMock: React.FC<{
    href: string;
    children?: React.ReactNode;
    className?: string;
    title?: string;
  }> = ({ href, children, className, title }) =>
    React.createElement('a', { href, className, title }, children);
  return { default: LinkMock };
});

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname.current,
  useSelectedLayoutSegments: () => mockSegments.current,
}));

// ---------------------------------------------------------------------------
// Mock lucide-react — lightweight SVG stubs
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => {
  const icon =
    (name: string) =>
    ({ size, className }: { size?: number; className?: string }) =>
      React.createElement('svg', { 'data-icon': name, width: size, className });
  return {
    Play: icon('Play'),
    AlertCircle: icon('AlertCircle'),
    DollarSign: icon('DollarSign'),
    Map: icon('Map'),
    Layers: icon('Layers'),
    ChevronLeft: icon('ChevronLeft'),
    ChevronRight: icon('ChevronRight'),
    Search: icon('Search'),
    Settings: icon('Settings'),
  };
});

// ---------------------------------------------------------------------------
// Mock React — intercept useState so hooks work outside renderer context
// ---------------------------------------------------------------------------

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof React>();
  return {
    ...actual,
    useState: vi.fn(),
    useEffect: vi.fn(),
    createElement: actual.createElement,
    Fragment: actual.Fragment,
    forwardRef: actual.forwardRef,
  };
});

// ---------------------------------------------------------------------------
// Import components AFTER mocks are set up
// ---------------------------------------------------------------------------

import { Sidebar } from '../Sidebar';
import { TopBar } from '../TopBar';
import { Breadcrumbs } from '../Breadcrumbs';

// ---------------------------------------------------------------------------
// localStorage mock helper
// ---------------------------------------------------------------------------

function setupLocalStorage(initial: Record<string, string> = {}): {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
} {
  const store: Record<string, string> = { ...initial };
  const lsMock = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: lsMock,
    writable: true,
    configurable: true,
  });
  return lsMock;
}

// ---------------------------------------------------------------------------
// Tree-walking helpers
// ---------------------------------------------------------------------------

/**
 * Expand a React element tree by calling function components recursively.
 * This is necessary to inspect the output of local components like NavGroup.
 * Host elements ('div', 'span', etc.) are returned as-is with expanded children.
 * Function components are called with their props to get the rendered subtree.
 *
 * Depth-limited to avoid infinite loops.
 */
function expand(node: React.ReactNode, depth = 0): React.ReactNode {
  if (depth > 20) return node;
  if (node === null || node === undefined || typeof node === 'boolean') return node;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map((n) => expand(n, depth));
  const el = node as React.ReactElement;
  if (!el || typeof el !== 'object' || !('type' in el)) return node;

  // Function component — call it to get the rendered output
  if (typeof el.type === 'function') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rendered = (el.type as React.FC<any>)(el.props ?? {});
      return expand(rendered, depth + 1);
    } catch {
      // If call fails (e.g., hooks issue), fall back to expanding children
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

  // Host element — expand children
  if (el.props?.children) {
    return React.cloneElement(el, {}, expand(el.props.children, depth + 1));
  }
  return el;
}

/** Flatten all text content from a (possibly unexpanded) React element tree. */
function flattenText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  const el = node as React.ReactElement;
  if (el?.props) return flattenText(el.props.children);
  return '';
}

/** Flatten text from an expanded tree. */
function expandAndFlattenText(node: React.ReactNode): string {
  return flattenText(expand(node));
}

type ElementPredicate = (el: React.ReactElement) => boolean;

/** Find first element in an already-expanded tree matching predicate. */
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

/** Find element in expanded tree. */
function findInExpanded(
  node: React.ReactNode,
  pred: ElementPredicate,
): React.ReactElement | null {
  return findElement(expand(node), pred);
}

/** Collect all className strings from an expanded element tree. */
function collectClassNames(node: React.ReactNode): string[] {
  const result: string[] = [];
  function walk(n: React.ReactNode): void {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const el = n as React.ReactElement;
    if (typeof el.props?.className === 'string') result.push(el.props.className);
    if (el.props?.children) walk(el.props.children);
  }
  walk(node);
  return result;
}

/**
 * Find a Link element (mocked next/link) by its href prop.
 * Before expansion: type is the mock function.
 * After expansion: type is 'a'.
 * Works on both — search for 'a' with href OR function type with href.
 */
function findLinkByHref(
  node: React.ReactNode,
  href: string,
): React.ReactElement | null {
  // Search expanded tree for <a href="...">
  const expanded = expand(node);
  return findElement(
    expanded,
    (el) => el.type === 'a' && el.props?.href === href,
  );
}

// ---------------------------------------------------------------------------
// Shared beforeEach setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset sidebar state to expanded by default
  sidebarState.collapsed = false;
  sidebarState.setCollapsed.mockReset();
  mockPathname.current = '/';
  mockSegments.current = [];
  setupLocalStorage({});

  // Reset React mock hooks
  // useState: first call (collapsed) returns [false, setCollapsed] by default
  vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
    // Sidebar's first useState is `collapsed` — detect by initial value being a boolean
    // or a lazy initializer function that returns a boolean (used to avoid FOUC).
    const resolved = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    if (typeof resolved === 'boolean') {
      return [sidebarState.collapsed, sidebarState.setCollapsed];
    }
    return [resolved, vi.fn()];
  }) as typeof React.useState);

  vi.mocked(React.useEffect).mockImplementation(vi.fn());
});

// ===========================================================================
// SIDEBAR TESTS
// ===========================================================================

describe('Sidebar — named exports', () => {
  it('exports Sidebar as a function', () => {
    expect(typeof Sidebar).toBe('function');
  });
});

describe('Sidebar — expanded state (collapsed = false)', () => {
  it('renders <aside> as top-level element', () => {
    const el = Sidebar({}) as React.ReactElement;
    expect(el.type).toBe('aside');
  });

  it('aside has w-60 class when expanded', () => {
    const el = Sidebar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('w-60');
    expect(cls).not.toContain('w-16');
  });

  it('aside has transition-[width] class', () => {
    const el = Sidebar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('transition-[width]');
  });

  it('shows brand text "Forja" when expanded', () => {
    const el = Sidebar({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Forja');
  });

  it('toggle button has aria-label "Collapse sidebar" when expanded', () => {
    const el = Sidebar({}) as React.ReactElement;
    const btn = findInExpanded(
      el,
      (e) => e.type === 'button' && e.props['aria-label'] === 'Collapse sidebar',
    );
    expect(btn).not.toBeNull();
  });

  it('nav group label "Pipeline" is visible when expanded', () => {
    const el = Sidebar({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Pipeline');
  });

  it('nav group label "Observabilidade" is visible when expanded', () => {
    const el = Sidebar({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Observabilidade');
  });

  it('nav item labels are rendered when expanded', () => {
    const el = Sidebar({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Runs');
    expect(text).toContain('Issues');
    expect(text).toContain('Cost');
    expect(text).toContain('Heatmap');
    expect(text).toContain('DLQ');
  });
});

describe('Sidebar — collapsed state (collapsed = true)', () => {
  beforeEach(() => {
    sidebarState.collapsed = true;
    vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
      const resolved = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      if (typeof resolved === 'boolean') {
        return [sidebarState.collapsed, sidebarState.setCollapsed];
      }
      return [resolved, vi.fn()];
    }) as typeof React.useState);
  });

  it('aside has w-16 class when collapsed', () => {
    const el = Sidebar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('w-16');
    expect(cls).not.toContain('w-60');
  });

  it('shows brand letter "F" (not full "Forja") when collapsed', () => {
    const el = Sidebar({}) as React.ReactElement;
    // When collapsed, only the "F" span is rendered — "Forja" span is absent
    const forjaSpan = findInExpanded(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Forja',
    );
    expect(forjaSpan).toBeNull();
    const fSpan = findInExpanded(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'F',
    );
    expect(fSpan).not.toBeNull();
  });

  it('toggle button has aria-label "Expand sidebar" when collapsed', () => {
    const el = Sidebar({}) as React.ReactElement;
    const btn = findInExpanded(
      el,
      (e) => e.type === 'button' && e.props['aria-label'] === 'Expand sidebar',
    );
    expect(btn).not.toBeNull();
  });

  it('nav group labels are hidden when collapsed', () => {
    const el = Sidebar({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).not.toContain('Pipeline');
    expect(text).not.toContain('Observabilidade');
  });

  it('collapsed nav links have title attribute for icon tooltip', () => {
    const el = Sidebar({}) as React.ReactElement;
    // When collapsed, Link elements pass title={itemLabel} for tooltip
    const expandedTree = expand(el);
    // Link mock renders as <a>, find one with a title attribute
    const linkWithTitle = findElement(
      expandedTree,
      (e) => e.type === 'a' && e.props?.title !== undefined,
    );
    expect(linkWithTitle).not.toBeNull();
  });
});

describe('Sidebar — localStorage persistence', () => {
  it('registers a useEffect for reading localStorage on mount', () => {
    Sidebar({});
    expect(vi.mocked(React.useEffect)).toHaveBeenCalled();
  });

  it('toggle button onClick calls setCollapsed', () => {
    sidebarState.collapsed = false;
    const el = Sidebar({}) as React.ReactElement;
    const btn = findInExpanded(
      el,
      (e) =>
        e.type === 'button' &&
        typeof e.props['aria-label'] === 'string' &&
        e.props['aria-label'].includes('sidebar'),
    );
    expect(btn).not.toBeNull();
    btn!.props.onClick();
    expect(sidebarState.setCollapsed).toHaveBeenCalled();
  });
});

describe('Sidebar — active nav item styling', () => {
  it('applies border-forja-border-gold to the active link at /runs', () => {
    mockPathname.current = '/runs';
    const el = Sidebar({}) as React.ReactElement;
    const classNames = collectClassNames(expand(el));
    // Active link has border-forja-border-gold (not the /20 dimmed separator)
    const activeGold = classNames.filter(
      (c) => c.includes('border-forja-border-gold') && !c.includes('/20'),
    );
    expect(activeGold.length).toBeGreaterThan(0);
  });

  it('applies bg-forja-bg-overlay class to the active link', () => {
    mockPathname.current = '/issues';
    const el = Sidebar({}) as React.ReactElement;
    const classNames = collectClassNames(expand(el));
    const overlayBg = classNames.filter((c) => c.includes('bg-forja-bg-overlay'));
    expect(overlayBg.length).toBeGreaterThan(0);
  });

  it('does NOT apply border-forja-border-gold link class at root path /', () => {
    mockPathname.current = '/';
    const el = Sidebar({}) as React.ReactElement;
    const classNames = collectClassNames(expand(el));
    const activeLinks = classNames.filter(
      (c) =>
        c.includes('border-forja-border-gold') &&
        !c.includes('/20') &&
        !c.includes('/30'),
    );
    expect(activeLinks.length).toBe(0);
  });

  it('active icon has text-forja-text-gold class', () => {
    mockPathname.current = '/cost';
    const el = Sidebar({}) as React.ReactElement;
    const classNames = collectClassNames(expand(el));
    const goldText = classNames.filter((c) => c.includes('text-forja-text-gold'));
    expect(goldText.length).toBeGreaterThan(0);
  });
});

describe('Sidebar — nav item links (using Link mock type matching)', () => {
  it('Runs link has href="/runs"', () => {
    const el = Sidebar({}) as React.ReactElement;
    expect(findLinkByHref(el, '/runs')).not.toBeNull();
  });

  it('Issues link has href="/issues"', () => {
    const el = Sidebar({}) as React.ReactElement;
    expect(findLinkByHref(el, '/issues')).not.toBeNull();
  });

  it('Cost link has href="/cost"', () => {
    const el = Sidebar({}) as React.ReactElement;
    expect(findLinkByHref(el, '/cost')).not.toBeNull();
  });

  it('Heatmap link has href="/heatmap"', () => {
    const el = Sidebar({}) as React.ReactElement;
    expect(findLinkByHref(el, '/heatmap')).not.toBeNull();
  });

  it('DLQ link has href="/dlq"', () => {
    const el = Sidebar({}) as React.ReactElement;
    expect(findLinkByHref(el, '/dlq')).not.toBeNull();
  });
});

describe('Sidebar — aside structural classes', () => {
  it('has sticky and h-screen classes', () => {
    const el = Sidebar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('sticky');
    expect(cls).toContain('h-screen');
  });

  it('has z-30 stacking class', () => {
    const el = Sidebar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('z-30');
  });

  it('has bg-forja-bg-surface class', () => {
    const el = Sidebar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('bg-forja-bg-surface');
  });

  it('has border-r class for sidebar border', () => {
    const el = Sidebar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('border-r');
  });

  it('renders a <nav> element for navigation', () => {
    const el = Sidebar({}) as React.ReactElement;
    const nav = findInExpanded(el, (e) => e.type === 'nav');
    expect(nav).not.toBeNull();
  });
});

// ===========================================================================
// TOPBAR TESTS
// ===========================================================================

describe('TopBar — named exports', () => {
  it('exports TopBar as a function', () => {
    expect(typeof TopBar).toBe('function');
  });
});

describe('TopBar — element structure', () => {
  beforeEach(() => {
    mockSegments.current = [];
  });

  it('renders a <header> as the root element', () => {
    const el = TopBar({}) as React.ReactElement;
    expect(el.type).toBe('header');
  });

  it('header has h-14 class (56px height via Tailwind h-14 = 3.5rem = 56px)', () => {
    const el = TopBar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('h-14');
  });

  it('header has sticky and z-20 positioning classes', () => {
    const el = TopBar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('sticky');
    expect(cls).toContain('z-20');
  });

  it('header has bg-forja-bg-surface class', () => {
    const el = TopBar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('bg-forja-bg-surface');
  });

  it('header has border-b class', () => {
    const el = TopBar({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('border-b');
  });

  it('renders a search button with aria-label "Open command palette"', () => {
    const el = TopBar({}) as React.ReactElement;
    const btn = findElement(
      el,
      (e) => e.type === 'button' && e.props['aria-label'] === 'Open command palette',
    );
    expect(btn).not.toBeNull();
  });

  it('search button contains placeholder text "Buscar runs, findings, issues…"', () => {
    const el = TopBar({}) as React.ReactElement;
    const text = flattenText(el);
    expect(text).toContain('Buscar runs, findings, issues');
  });

  it('renders ⌘K keyboard hint text', () => {
    const el = TopBar({}) as React.ReactElement;
    const text = flattenText(el);
    expect(text).toContain('⌘K');
  });

  it('⌘K is inside a <kbd> element', () => {
    const el = TopBar({}) as React.ReactElement;
    const kbd = findElement(el, (e) => e.type === 'kbd');
    expect(kbd).not.toBeNull();
    expect(flattenText(kbd)).toContain('⌘K');
  });

  it('<kbd> element has font-mono class', () => {
    const el = TopBar({}) as React.ReactElement;
    const kbd = findElement(el, (e) => e.type === 'kbd');
    expect(kbd).not.toBeNull();
    expect(kbd!.props.className).toContain('font-mono');
  });

  it('renders settings button with aria-label "Settings"', () => {
    const el = TopBar({}) as React.ReactElement;
    const btn = findElement(
      el,
      (e) => e.type === 'button' && e.props['aria-label'] === 'Settings',
    );
    expect(btn).not.toBeNull();
  });

  it('search button has bg-forja-bg-elevated class', () => {
    const el = TopBar({}) as React.ReactElement;
    const btn = findElement(
      el,
      (e) => e.type === 'button' && e.props['aria-label'] === 'Open command palette',
    );
    expect(btn).not.toBeNull();
    expect(btn!.props.className).toContain('bg-forja-bg-elevated');
  });

  it('search button has border class for outline', () => {
    const el = TopBar({}) as React.ReactElement;
    const btn = findElement(
      el,
      (e) => e.type === 'button' && e.props['aria-label'] === 'Open command palette',
    );
    expect(btn).not.toBeNull();
    expect(btn!.props.className).toContain('border');
  });
});

// ===========================================================================
// BREADCRUMBS TESTS
// ===========================================================================

describe('Breadcrumbs — named exports', () => {
  it('exports Breadcrumbs as a function', () => {
    expect(typeof Breadcrumbs).toBe('function');
  });
});

describe('Breadcrumbs — empty segments (Home fallback)', () => {
  beforeEach(() => {
    mockSegments.current = [];
  });

  it('renders "Home" text when segments are empty', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(flattenText(el)).toContain('Home');
  });

  it('renders a <span> (not <nav>) when segments are empty', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(el.type).toBe('span');
  });

  it('Home span has text-forja-text-primary class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('text-forja-text-primary');
  });

  it('Home span has font-medium class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('font-medium');
  });
});

describe('Breadcrumbs — single segment', () => {
  beforeEach(() => {
    mockSegments.current = ['runs'];
  });

  it('renders a <nav> element when segments are present', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(el.type).toBe('nav');
  });

  it('nav has aria-label="Breadcrumb"', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(el.props['aria-label']).toBe('Breadcrumb');
  });

  it('renders a Home link with href="/"', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const homeLink = findLinkByHref(el, '/');
    expect(homeLink).not.toBeNull();
    expect(flattenText(homeLink)).toContain('Home');
  });

  it('renders "›" separator character', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(flattenText(el)).toContain('›');
  });

  it('capitalizes the segment label (runs → Runs)', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(flattenText(el)).toContain('Runs');
  });

  it('last segment is a <span> (not a link)', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    // Should not be a Link element with href="/runs"
    const runsLink = findLinkByHref(el, '/runs');
    expect(runsLink).toBeNull();
    // Should be a plain span
    const runsSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Runs',
    );
    expect(runsSpan).not.toBeNull();
  });

  it('last segment span has text-forja-text-primary class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const runsSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Runs',
    );
    expect(runsSpan).not.toBeNull();
    expect(runsSpan!.props.className).toContain('text-forja-text-primary');
  });

  it('last segment span has font-medium class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const runsSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Runs',
    );
    expect(runsSpan).not.toBeNull();
    expect(runsSpan!.props.className).toContain('font-medium');
  });

  it('Home link has text-forja-text-secondary class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const homeLink = findLinkByHref(el, '/');
    expect(homeLink).not.toBeNull();
    expect(homeLink!.props.className).toContain('text-forja-text-secondary');
  });
});

describe('Breadcrumbs — multiple segments', () => {
  beforeEach(() => {
    mockSegments.current = ['runs', 'details'];
  });

  it('renders all segment labels', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const text = flattenText(el);
    expect(text).toContain('Home');
    expect(text).toContain('Runs');
    expect(text).toContain('Details');
  });

  it('intermediate segment "runs" is a Link with href="/runs"', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const runsLink = findLinkByHref(el, '/runs');
    expect(runsLink).not.toBeNull();
    expect(flattenText(runsLink)).toContain('Runs');
  });

  it('intermediate segment link has text-forja-text-secondary class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const runsLink = findLinkByHref(el, '/runs');
    expect(runsLink).not.toBeNull();
    expect(runsLink!.props.className).toContain('text-forja-text-secondary');
  });

  it('last segment "details" is a <span> not a link', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const detailsLink = findLinkByHref(el, '/runs/details');
    expect(detailsLink).toBeNull();
    const detailsSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Details',
    );
    expect(detailsSpan).not.toBeNull();
  });

  it('last segment has text-forja-text-primary class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const detailsSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Details',
    );
    expect(detailsSpan).not.toBeNull();
    expect(detailsSpan!.props.className).toContain('text-forja-text-primary');
  });

  it('last segment has font-medium class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const detailsSpan = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Details',
    );
    expect(detailsSpan).not.toBeNull();
    expect(detailsSpan!.props.className).toContain('font-medium');
  });

  it('renders two "›" separators for two segments', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const count = (flattenText(el).match(/›/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('separator spans have text-forja-text-gold class', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const separators: React.ReactElement[] = [];
    function walk(node: React.ReactNode): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const e = node as React.ReactElement;
      if (e.type === 'span' && flattenText(e) === '›') separators.push(e);
      if (e.props?.children) walk(e.props.children);
    }
    walk(el);
    expect(separators.length).toBeGreaterThan(0);
    for (const sep of separators) {
      expect(sep.props.className).toContain('text-forja-text-gold');
    }
  });

  it('builds correct href for intermediate segment (/runs)', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(findLinkByHref(el, '/runs')).not.toBeNull();
  });
});

describe('Breadcrumbs — three segments (deep path)', () => {
  beforeEach(() => {
    mockSegments.current = ['runs', 'abc123', 'findings'];
  });

  it('renders three "›" separators', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const count = (flattenText(el).match(/›/g) ?? []).length;
    expect(count).toBe(3);
  });

  it('builds cumulative hrefs: /runs and /runs/abc123 are links', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(findLinkByHref(el, '/runs')).not.toBeNull();
    expect(findLinkByHref(el, '/runs/abc123')).not.toBeNull();
  });

  it('last segment "findings" is a span with text-forja-text-primary', () => {
    const el = Breadcrumbs({}) as React.ReactElement;
    const span = findElement(
      el,
      (e) => e.type === 'span' && flattenText(e) === 'Findings',
    );
    expect(span).not.toBeNull();
    expect(span!.props.className).toContain('text-forja-text-primary');
  });
});

describe('Breadcrumbs — capitalize helper', () => {
  it('capitalizes lowercase segment (heatmap → Heatmap)', () => {
    mockSegments.current = ['heatmap'];
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(flattenText(el)).toContain('Heatmap');
    expect(flattenText(el)).not.toContain('heatmap');
  });

  it('preserves already-uppercase segment (DLQ → DLQ)', () => {
    mockSegments.current = ['DLQ'];
    const el = Breadcrumbs({}) as React.ReactElement;
    expect(flattenText(el)).toContain('DLQ');
  });

  it('capitalizes first char only (issues → Issues, not ISSUES)', () => {
    mockSegments.current = ['issues'];
    const el = Breadcrumbs({}) as React.ReactElement;
    const text = flattenText(el);
    expect(text).toContain('Issues');
    expect(text).not.toContain('ISSUES');
  });
});
