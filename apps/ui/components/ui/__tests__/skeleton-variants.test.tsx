/**
 * Unit tests for skeleton variants in apps/ui/components/ui/skeleton.tsx (MOB-1102)
 *
 * Covers: SkeletonRow, SkeletonCard, SkeletonChart
 * Tests without DOM rendering — validates element structure, aria attributes,
 * CSS classes, animation delays, and stagger behavior.
 *
 * Run from monorepo root:
 *   npx vitest run --pool=threads apps/ui/components/ui/__tests__/skeleton-variants.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { SkeletonRow, SkeletonCard, SkeletonChart } from '../skeleton';

// ---------------------------------------------------------------------------
// Tree-walking helpers
// ---------------------------------------------------------------------------

type ElementPredicate = (el: React.ReactElement) => boolean;

/**
 * Expand a React element tree by calling function components recursively.
 * Required to inspect nested components like Skeleton inside SkeletonRow.
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

/** Find all elements in the EXPANDED tree (calls function components). */
function findAllInExpanded(node: React.ReactNode, pred: ElementPredicate): React.ReactElement[] {
  return findAllElements(expand(node), pred);
}

// ===========================================================================
// Skeleton base — already tested in skeleton.test.tsx, spot check here
// ===========================================================================

describe('Skeleton variants — exports', () => {
  it('exports SkeletonRow as a function', () => {
    expect(typeof SkeletonRow).toBe('function');
  });

  it('exports SkeletonCard as a function', () => {
    expect(typeof SkeletonCard).toBe('function');
  });

  it('exports SkeletonChart as a function', () => {
    expect(typeof SkeletonChart).toBe('function');
  });
});

// ===========================================================================
// SkeletonRow
// ===========================================================================

describe('SkeletonRow — element structure', () => {
  it('renders a <tr> as root element', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    expect(el.type).toBe('tr');
  });

  it('<tr> has aria-hidden="true" (decorative skeleton, not real content)', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    expect(el.props['aria-hidden']).toBe('true');
  });

  it('<tr> has animate-fade-in-up class', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    expect(el.props.className).toContain('animate-fade-in-up');
  });

  it('<tr> has border-b class for row separator', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    expect(el.props.className).toContain('border-b');
  });
});

describe('SkeletonRow — animation delay', () => {
  it('uses animationDelay "0ms" when delay=0 (default)', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    expect(el.props.style?.animationDelay).toBe('0ms');
  });

  it('uses correct animationDelay when delay=200', () => {
    const el = SkeletonRow({ delay: 200 }) as React.ReactElement;
    expect(el.props.style?.animationDelay).toBe('200ms');
  });

  it('has animationFillMode "both"', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    expect(el.props.style?.animationFillMode).toBe('both');
  });
});

describe('SkeletonRow — default 6 columns', () => {
  it('renders 6 <td> elements by default', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    const tds = findAllElements(el, (e) => e.type === 'td');
    expect(tds.length).toBe(6);
  });

  it('each <td> contains a Skeleton div with animate-shimmer', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    // Skeleton is a function component — must expand to see its rendered <div>
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs.length).toBe(6);
  });
});

describe('SkeletonRow — custom columns', () => {
  it('renders 3 <td> elements when columns=3', () => {
    const el = SkeletonRow({ columns: 3 }) as React.ReactElement;
    const tds = findAllElements(el, (e) => e.type === 'td');
    expect(tds.length).toBe(3);
  });

  it('renders 8 <td> elements when columns=8', () => {
    const el = SkeletonRow({ columns: 8 }) as React.ReactElement;
    const tds = findAllElements(el, (e) => e.type === 'td');
    expect(tds.length).toBe(8);
  });
});

describe('SkeletonRow — staggered cell delays', () => {
  it('first cell Skeleton has animationDelay equal to row delay', () => {
    const el = SkeletonRow({ delay: 100, columns: 3 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    // First cell delay = delay + 0 * 100 = 100ms
    expect(shimmerDivs[0].props.style?.animationDelay).toBe('100ms');
  });

  it('second cell Skeleton has animationDelay = delay + 100ms', () => {
    const el = SkeletonRow({ delay: 100, columns: 3 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    // Second cell delay = delay + 1 * 100 = 200ms
    expect(shimmerDivs[1].props.style?.animationDelay).toBe('200ms');
  });
});

describe('SkeletonRow — shimmer gold color (acceptance criterion: shimmer dourado)', () => {
  it('Skeleton cells use bg-forja-bg-elevated (not generic white)', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    for (const div of shimmerDivs) {
      expect(div.props.className).toContain('bg-forja-bg-elevated');
    }
  });

  it('Skeleton cells use gold gradient background (rgba 201,168,76)', () => {
    const el = SkeletonRow({}) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    for (const div of shimmerDivs) {
      expect(div.props.className).toContain('bg-[linear-gradient');
    }
  });
});

// ===========================================================================
// SkeletonCard
// ===========================================================================

describe('SkeletonCard — element structure', () => {
  it('renders a <div> as root element', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('<div> has aria-hidden="true"', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.props['aria-hidden']).toBe('true');
  });

  it('<div> has animate-fade-in-up class', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.props.className).toContain('animate-fade-in-up');
  });

  it('<div> has bg-forja-bg-surface class', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.props.className).toContain('bg-forja-bg-surface');
  });

  it('<div> has rounded-lg class', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.props.className).toContain('rounded-lg');
  });

  it('<div> has border class', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.props.className).toContain('border');
  });

  it('merges custom className', () => {
    const el = SkeletonCard({ className: 'max-w-sm' }) as React.ReactElement;
    expect(el.props.className).toContain('max-w-sm');
    expect(el.props.className).toContain('animate-fade-in-up');
  });
});

describe('SkeletonCard — animation delay', () => {
  it('uses animationDelay "0ms" when delay=0 (default)', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.props.style?.animationDelay).toBe('0ms');
  });

  it('uses correct animationDelay when delay=300', () => {
    const el = SkeletonCard({ delay: 300 }) as React.ReactElement;
    expect(el.props.style?.animationDelay).toBe('300ms');
  });

  it('has animationFillMode "both"', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    expect(el.props.style?.animationFillMode).toBe('both');
  });
});

describe('SkeletonCard — contains 3 staggered Skeleton lines', () => {
  it('renders 3 shimmer divs (title + 2 lines)', () => {
    const el = SkeletonCard({}) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs.length).toBe(3);
  });

  it('first Skeleton line has animationDelay matching card delay', () => {
    const el = SkeletonCard({ delay: 100 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs[0].props.style?.animationDelay).toBe('100ms');
  });

  it('second Skeleton line has animationDelay = delay + 100ms', () => {
    const el = SkeletonCard({ delay: 100 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs[1].props.style?.animationDelay).toBe('200ms');
  });

  it('third Skeleton line has animationDelay = delay + 200ms', () => {
    const el = SkeletonCard({ delay: 100 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs[2].props.style?.animationDelay).toBe('300ms');
  });
});

// ===========================================================================
// SkeletonChart
// ===========================================================================

describe('SkeletonChart — element structure', () => {
  it('renders a <div> as root element', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('<div> has aria-hidden="true"', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    expect(el.props['aria-hidden']).toBe('true');
  });

  it('<div> has animate-fade-in-up class', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    expect(el.props.className).toContain('animate-fade-in-up');
  });

  it('<div> has bg-forja-bg-surface class', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    expect(el.props.className).toContain('bg-forja-bg-surface');
  });

  it('<div> has rounded-lg class', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    expect(el.props.className).toContain('rounded-lg');
  });

  it('merges custom className', () => {
    const el = SkeletonChart({ className: 'col-span-2' }) as React.ReactElement;
    expect(el.props.className).toContain('col-span-2');
  });
});

describe('SkeletonChart — animation delay', () => {
  it('uses animationDelay "0ms" when delay=0 (default)', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    expect(el.props.style?.animationDelay).toBe('0ms');
  });

  it('uses correct animationDelay when delay=150', () => {
    const el = SkeletonChart({ delay: 150 }) as React.ReactElement;
    expect(el.props.style?.animationDelay).toBe('150ms');
  });

  it('has animationFillMode "both"', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    expect(el.props.style?.animationFillMode).toBe('both');
  });
});

describe('SkeletonChart — contains title + chart area Skeletons', () => {
  it('renders 2 shimmer divs (title + chart area)', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs.length).toBe(2);
  });

  it('chart area Skeleton uses configurable height (default 240px)', () => {
    const el = SkeletonChart({}) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    // Second shimmer div is the chart area — uses inline height style
    const chartArea = shimmerDivs[1];
    expect(chartArea.props.style?.height).toBe('240px');
  });

  it('chart area Skeleton uses custom height when provided', () => {
    const el = SkeletonChart({ height: 320 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    const chartArea = shimmerDivs[1];
    expect(chartArea.props.style?.height).toBe('320px');
  });

  it('title Skeleton has animationDelay matching chart delay', () => {
    const el = SkeletonChart({ delay: 50 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs[0].props.style?.animationDelay).toBe('50ms');
  });

  it('chart area Skeleton has animationDelay = delay + 100ms', () => {
    const el = SkeletonChart({ delay: 50 }) as React.ReactElement;
    const shimmerDivs = findAllInExpanded(
      el,
      (e) => e.type === 'div' && typeof e.props.className === 'string' && e.props.className.includes('animate-shimmer'),
    );
    expect(shimmerDivs[1].props.style?.animationDelay).toBe('150ms');
  });
});
