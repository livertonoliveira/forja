/**
 * Integration tests for loading.tsx files (MOB-1102)
 *
 * Verifies that each route's loading skeleton:
 * - Is a valid function component (default export)
 * - Returns a React element tree (not null)
 * - Uses SkeletonRow, SkeletonCard, or SkeletonChart (choreographed)
 * - Contains animate-fade-in-up or animate-shimmer classes somewhere in the tree
 *
 * Tests without DOM rendering — inspects the React element tree returned by
 * each Loading component directly, using the same tree-walking helpers as
 * other component tests in this project.
 *
 * Run from monorepo root:
 *   npx vitest run --pool=threads apps/ui/app/__tests__/loading-pages.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Tree-walking helpers
// ---------------------------------------------------------------------------

type ElementPredicate = (el: React.ReactElement) => boolean;

function findElement(node: React.ReactNode, pred: ElementPredicate): React.ReactElement | null {
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

function findAllElements(node: React.ReactNode, pred: ElementPredicate): React.ReactElement[] {
  const results: React.ReactElement[] = [];
  if (!node || typeof node !== 'object') return results;
  if (Array.isArray(node)) {
    for (const child of node) {
      results.push(...findAllElements(child, pred));
    }
    return results;
  }
  const el = node as React.ReactElement;
  if (pred(el)) results.push(el);
  if (el.props?.children) results.push(...findAllElements(el.props.children, pred));
  return results;
}

/**
 * Expand a React element tree by calling function components recursively.
 * This is necessary because SkeletonRow/SkeletonCard/SkeletonChart are
 * function components — we must call them to get their rendered output.
 */
function expand(node: React.ReactNode, depth = 0): React.ReactNode {
  if (depth > 30) return node;
  if (node === null || node === undefined || typeof node === 'boolean') return node;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map((n) => expand(n, depth));
  const el = node as React.ReactElement;
  if (!el || typeof el !== 'object' || !('type' in el)) return node;

  if (typeof el.type === 'function') {
    try {
      const rendered = (el.type as React.FC<Record<string, unknown>>)(el.props ?? {});
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

function findInExpanded(node: React.ReactNode, pred: ElementPredicate): React.ReactElement | null {
  return findElement(expand(node), pred);
}

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

// ===========================================================================
// Root loading.tsx (app/loading.tsx)
// ===========================================================================

describe('app/loading.tsx — root page skeleton', () => {
  it('default export is a function component', async () => {
    const mod = await import('../loading');
    expect(typeof mod.default).toBe('function');
  });

  it('renders a non-null React element', async () => {
    const { default: Loading } = await import('../loading');
    const el = Loading();
    expect(el).not.toBeNull();
    expect(el).toBeTruthy();
  });

  it('root element is a <div>', async () => {
    const { default: Loading } = await import('../loading');
    const el = Loading() as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('contains a SkeletonRow element in the tree (choreographed table rows)', async () => {
    const { default: Loading } = await import('../loading');
    const el = Loading() as React.ReactElement;
    // SkeletonRow renders <tr> with aria-hidden="true" and animate-fade-in-up
    const skeletonTr = findInExpanded(
      el,
      (e) => e.type === 'tr' && e.props['aria-hidden'] === 'true',
    );
    expect(skeletonTr).not.toBeNull();
  });

  it('contains a <table> element (runs list skeleton)', async () => {
    const { default: Loading } = await import('../loading');
    const el = Loading() as React.ReactElement;
    const table = findInExpanded(el, (e) => e.type === 'table');
    expect(table).not.toBeNull();
  });

  it('contains animate-shimmer class somewhere in the tree (gold shimmer)', async () => {
    const { default: Loading } = await import('../loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    const allClasses = collectClassNames(expanded);
    const hasShimmer = allClasses.some((c) => c.includes('animate-shimmer'));
    expect(hasShimmer).toBe(true);
  });

  it('renders 6 skeleton table rows (staggered with 100ms delay each)', async () => {
    const { default: Loading } = await import('../loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    const trs = findAllElements(
      expanded as React.ReactElement,
      (e) => e.type === 'tr' && e.props['aria-hidden'] === 'true',
    );
    expect(trs.length).toBe(6);
  });
});

// ===========================================================================
// Runs loading.tsx (app/runs/loading.tsx)
// ===========================================================================

describe('app/runs/loading.tsx — runs page skeleton', () => {
  it('default export is a function component', async () => {
    const mod = await import('../runs/loading');
    expect(typeof mod.default).toBe('function');
  });

  it('renders a non-null React element', async () => {
    const { default: Loading } = await import('../runs/loading');
    const el = Loading();
    expect(el).not.toBeNull();
    expect(el).toBeTruthy();
  });

  it('root element is a <div>', async () => {
    const { default: Loading } = await import('../runs/loading');
    const el = Loading() as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('contains SkeletonChart elements (trend charts skeleton)', async () => {
    const { default: Loading } = await import('../runs/loading');
    const el = Loading() as React.ReactElement;
    // SkeletonChart renders <div> with aria-hidden="true" and animate-fade-in-up
    const chartSkeleton = findInExpanded(
      el,
      (e) =>
        e.type === 'div' &&
        e.props['aria-hidden'] === 'true' &&
        typeof e.props.className === 'string' &&
        e.props.className.includes('animate-fade-in-up'),
    );
    expect(chartSkeleton).not.toBeNull();
  });

  it('contains SkeletonRow elements (runs table skeleton)', async () => {
    const { default: Loading } = await import('../runs/loading');
    const el = Loading() as React.ReactElement;
    const skeletonTr = findInExpanded(
      el,
      (e) => e.type === 'tr' && e.props['aria-hidden'] === 'true',
    );
    expect(skeletonTr).not.toBeNull();
  });

  it('contains animate-shimmer class (gold shimmer, not generic white)', async () => {
    const { default: Loading } = await import('../runs/loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    const allClasses = collectClassNames(expanded);
    const hasShimmer = allClasses.some((c) => c.includes('animate-shimmer'));
    expect(hasShimmer).toBe(true);
  });

  it('renders 2 SkeletonChart elements (trend grid)', async () => {
    const { default: Loading } = await import('../runs/loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    // SkeletonChart produces <div aria-hidden="true" class="... animate-fade-in-up ...">
    const chartDivs = findAllElements(
      expanded as React.ReactElement,
      (e) =>
        e.type === 'div' &&
        e.props['aria-hidden'] === 'true' &&
        typeof e.props.className === 'string' &&
        e.props.className.includes('bg-forja-bg-surface'),
    );
    expect(chartDivs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders 8 skeleton table rows', async () => {
    const { default: Loading } = await import('../runs/loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    const trs = findAllElements(
      expanded as React.ReactElement,
      (e) => e.type === 'tr' && e.props['aria-hidden'] === 'true',
    );
    expect(trs.length).toBe(8);
  });
});

// ===========================================================================
// Cost loading.tsx (app/cost/loading.tsx)
// ===========================================================================

describe('app/cost/loading.tsx — cost page skeleton', () => {
  it('default export is a function component', async () => {
    const mod = await import('../cost/loading');
    expect(typeof mod.default).toBe('function');
  });

  it('renders a non-null React element', async () => {
    const { default: Loading } = await import('../cost/loading');
    const el = Loading();
    expect(el).not.toBeNull();
    expect(el).toBeTruthy();
  });

  it('root element is a <div>', async () => {
    const { default: Loading } = await import('../cost/loading');
    const el = Loading() as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('contains SkeletonCard element (cost summary card skeleton)', async () => {
    const { default: Loading } = await import('../cost/loading');
    const el = Loading() as React.ReactElement;
    const cardSkeleton = findInExpanded(
      el,
      (e) =>
        e.type === 'div' &&
        e.props['aria-hidden'] === 'true' &&
        typeof e.props.className === 'string' &&
        e.props.className.includes('bg-forja-bg-surface'),
    );
    expect(cardSkeleton).not.toBeNull();
  });

  it('contains SkeletonRow elements (cost table skeleton)', async () => {
    const { default: Loading } = await import('../cost/loading');
    const el = Loading() as React.ReactElement;
    const skeletonTr = findInExpanded(
      el,
      (e) => e.type === 'tr' && e.props['aria-hidden'] === 'true',
    );
    expect(skeletonTr).not.toBeNull();
  });

  it('contains animate-shimmer class (gold shimmer)', async () => {
    const { default: Loading } = await import('../cost/loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    const allClasses = collectClassNames(expanded);
    const hasShimmer = allClasses.some((c) => c.includes('animate-shimmer'));
    expect(hasShimmer).toBe(true);
  });

  it('contains animate-fade-in-up on non-table rows (stagger in heatmap section)', async () => {
    const { default: Loading } = await import('../cost/loading');
    const el = Loading() as React.ReactElement;
    // Cost loading has divs with animate-fade-in-up for heatmap rows
    const fadeDivs = findInExpanded(
      el,
      (e) =>
        e.type === 'div' &&
        typeof e.props.className === 'string' &&
        e.props.className.includes('animate-fade-in-up'),
    );
    expect(fadeDivs).not.toBeNull();
  });
});

// ===========================================================================
// DLQ loading.tsx (app/dlq/loading.tsx)
// ===========================================================================

describe('app/dlq/loading.tsx — DLQ page skeleton', () => {
  it('default export is a function component', async () => {
    const mod = await import('../dlq/loading');
    expect(typeof mod.default).toBe('function');
  });

  it('renders a non-null React element', async () => {
    const { default: Loading } = await import('../dlq/loading');
    const el = Loading();
    expect(el).not.toBeNull();
    expect(el).toBeTruthy();
  });

  it('root element is a <div>', async () => {
    const { default: Loading } = await import('../dlq/loading');
    const el = Loading() as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('contains SkeletonRow elements (DLQ events table skeleton)', async () => {
    const { default: Loading } = await import('../dlq/loading');
    const el = Loading() as React.ReactElement;
    const skeletonTr = findInExpanded(
      el,
      (e) => e.type === 'tr' && e.props['aria-hidden'] === 'true',
    );
    expect(skeletonTr).not.toBeNull();
  });

  it('contains animate-shimmer class (gold shimmer)', async () => {
    const { default: Loading } = await import('../dlq/loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    const allClasses = collectClassNames(expanded);
    const hasShimmer = allClasses.some((c) => c.includes('animate-shimmer'));
    expect(hasShimmer).toBe(true);
  });

  it('contains a <table> element for DLQ events', async () => {
    const { default: Loading } = await import('../dlq/loading');
    const el = Loading() as React.ReactElement;
    const table = findInExpanded(el, (e) => e.type === 'table');
    expect(table).not.toBeNull();
  });

  it('renders 5 SkeletonRow elements in DLQ table', async () => {
    const { default: Loading } = await import('../dlq/loading');
    const el = Loading() as React.ReactElement;
    const expanded = expand(el);
    const trs = findAllElements(
      expanded as React.ReactElement,
      (e) => e.type === 'tr' && e.props['aria-hidden'] === 'true',
    );
    expect(trs.length).toBe(5);
  });
});
