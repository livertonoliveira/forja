/**
 * Unit tests for apps/ui/components/shell/EmptyState.tsx (MOB-1102)
 *
 * Tests without DOM rendering — validates element trees, class names, text
 * content, watermark presence, and action rendering for all 5 semantic variants.
 *
 * Strategy:
 * - Mock next/link (as passthrough <a> element)
 * - Mock @/components/ui/button (passthrough <button> element)
 * - Call component functions directly to obtain React element trees
 * - Walk trees with helpers to assert on structure, text, and CSS classes
 *
 * Run from monorepo root:
 *   npx vitest run --pool=threads apps/ui/components/shell/__tests__/EmptyState.test.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before component imports
// ---------------------------------------------------------------------------

vi.mock('next/link', () => {
  const LinkMock: React.FC<{
    href: string;
    children?: React.ReactNode;
    className?: string;
  }> = ({ href, children, className }) =>
    React.createElement('a', { href, className }, children);
  return { default: LinkMock };
});

vi.mock('@/components/ui/button', () => {
  const Button: React.FC<{
    children?: React.ReactNode;
    onClick?: () => void;
    className?: string;
    variant?: string;
    size?: string;
  }> = ({ children, onClick, className }) =>
    React.createElement('button', { onClick, className }, children);
  return { Button };
});

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import {
  EmptyState,
  EmptyRuns,
  EmptyFilters,
  EmptyDLQ,
  EmptyComparison,
  EmptySearch,
} from '../EmptyState';

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

function flattenText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  const el = node as React.ReactElement;
  if (el?.props) return flattenText(el.props.children);
  return '';
}

function expandAndFlattenText(node: React.ReactNode): string {
  return flattenText(expand(node));
}

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

function findInExpanded(node: React.ReactNode, pred: ElementPredicate): React.ReactElement | null {
  return findElement(expand(node), pred);
}

// ===========================================================================
// EmptyState BASE COMPONENT
// ===========================================================================

describe('EmptyState — exports', () => {
  it('exports EmptyState as a function', () => {
    expect(typeof EmptyState).toBe('function');
  });
  it('exports EmptyRuns as a function', () => {
    expect(typeof EmptyRuns).toBe('function');
  });
  it('exports EmptyFilters as a function', () => {
    expect(typeof EmptyFilters).toBe('function');
  });
  it('exports EmptyDLQ as a function', () => {
    expect(typeof EmptyDLQ).toBe('function');
  });
  it('exports EmptyComparison as a function', () => {
    expect(typeof EmptyComparison).toBe('function');
  });
  it('exports EmptySearch as a function', () => {
    expect(typeof EmptySearch).toBe('function');
  });
});

describe('EmptyState — watermark "F" (acceptance criterion: watermark "F" em Fraunces discreto)', () => {
  it('renders a span with aria-hidden="true" containing text "F"', () => {
    const el = EmptyState({ title: 'Test' }) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' &&
        e.props['aria-hidden'] === 'true' &&
        flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
  });

  it('watermark span has opacity 0.04 style (4% opacity for discreteness)', () => {
    const el = EmptyState({ title: 'Test' }) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' &&
        e.props['aria-hidden'] === 'true' &&
        flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.props.style?.opacity).toBe(0.04);
  });

  it('watermark span has font-display class for Fraunces font', () => {
    const el = EmptyState({ title: 'Test' }) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' &&
        e.props['aria-hidden'] === 'true' &&
        flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.props.className).toContain('font-display');
  });

  it('watermark span has text-forja-text-gold class', () => {
    const el = EmptyState({ title: 'Test' }) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' &&
        e.props['aria-hidden'] === 'true' &&
        flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.props.className).toContain('text-forja-text-gold');
  });

  it('watermark span has select-none pointer-events-none for non-interactivity', () => {
    const el = EmptyState({ title: 'Test' }) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' &&
        e.props['aria-hidden'] === 'true' &&
        flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.props.className).toContain('select-none');
    expect(watermark!.props.className).toContain('pointer-events-none');
  });

  it('watermark span has absolute position (behind content)', () => {
    const el = EmptyState({ title: 'Test' }) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' &&
        e.props['aria-hidden'] === 'true' &&
        flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.props.className).toContain('absolute');
  });
});

describe('EmptyState — title rendering (gold color acceptance criterion)', () => {
  it('renders the title in an h2 element', () => {
    const el = EmptyState({ title: 'My Empty Title' }) as React.ReactElement;
    const h2 = findInExpanded(el, (e) => e.type === 'h2');
    expect(h2).not.toBeNull();
    expect(flattenText(h2)).toContain('My Empty Title');
  });

  it('title h2 has text-forja-text-gold class', () => {
    const el = EmptyState({ title: 'My Empty Title' }) as React.ReactElement;
    const h2 = findInExpanded(el, (e) => e.type === 'h2');
    expect(h2).not.toBeNull();
    expect(h2!.props.className).toContain('text-forja-text-gold');
  });

  it('title h2 has font-display class (Fraunces)', () => {
    const el = EmptyState({ title: 'My Empty Title' }) as React.ReactElement;
    const h2 = findInExpanded(el, (e) => e.type === 'h2');
    expect(h2).not.toBeNull();
    expect(h2!.props.className).toContain('font-display');
  });

  it('does NOT render description paragraph when description is absent', () => {
    const el = EmptyState({ title: 'My Title' }) as React.ReactElement;
    const p = findInExpanded(el, (e) => e.type === 'p');
    expect(p).toBeNull();
  });

  it('renders description in a <p> element when provided', () => {
    const el = EmptyState({ title: 'Title', description: 'My description text' }) as React.ReactElement;
    const p = findInExpanded(el, (e) => e.type === 'p');
    expect(p).not.toBeNull();
    expect(flattenText(p)).toContain('My description text');
  });

  it('description paragraph has text-forja-text-secondary class', () => {
    const el = EmptyState({ title: 'Title', description: 'Desc' }) as React.ReactElement;
    const p = findInExpanded(el, (e) => e.type === 'p');
    expect(p).not.toBeNull();
    expect(p!.props.className).toContain('text-forja-text-secondary');
  });
});

describe('EmptyState — root container layout', () => {
  it('root element is a <div>', () => {
    const el = EmptyState({ title: 'T' }) as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('root div has centered layout classes', () => {
    const el = EmptyState({ title: 'T' }) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-center');
  });

  it('root div has overflow-hidden (prevents watermark clipping issues)', () => {
    const el = EmptyState({ title: 'T' }) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('overflow-hidden');
  });

  it('merges custom className prop', () => {
    const el = EmptyState({ title: 'T', className: 'custom-class' }) as React.ReactElement;
    const cls: string = el.props.className ?? '';
    expect(cls).toContain('custom-class');
  });
});

describe('EmptyState — action button (href variant)', () => {
  it('renders an <a> element when action has href', () => {
    const el = EmptyState({
      title: 'T',
      action: { label: 'Go', href: '/somewhere' },
    }) as React.ReactElement;
    const link = findInExpanded(el, (e) => e.type === 'a' && e.props.href === '/somewhere');
    expect(link).not.toBeNull();
  });

  it('renders action label text inside the link', () => {
    const el = EmptyState({
      title: 'T',
      action: { label: 'Click me', href: '/somewhere' },
    }) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Click me');
  });
});

describe('EmptyState — action button (onClick variant)', () => {
  it('renders a <button> element when action has onClick (no href)', () => {
    const onClick = vi.fn();
    const el = EmptyState({
      title: 'T',
      action: { label: 'Do it', onClick },
    }) as React.ReactElement;
    const btn = findInExpanded(el, (e) => e.type === 'button');
    expect(btn).not.toBeNull();
  });

  it('does not render action when action prop is absent', () => {
    const el = EmptyState({ title: 'T' }) as React.ReactElement;
    const btn = findInExpanded(el, (e) => e.type === 'button');
    expect(btn).toBeNull();
  });
});

// ===========================================================================
// EmptyRuns VARIANT
// ===========================================================================

describe('EmptyRuns — semantic variant (acceptance criterion: "Nenhum run ainda")', () => {
  it('renders with title "Nenhum run ainda"', () => {
    const el = EmptyRuns({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Nenhum run ainda');
  });

  it('renders without an action button when onRun is not provided', () => {
    const el = EmptyRuns({}) as React.ReactElement;
    const btn = findInExpanded(el, (e) => e.type === 'button');
    expect(btn).toBeNull();
  });

  it('renders an action button when onRun callback is provided', () => {
    const onRun = vi.fn();
    const el = EmptyRuns({ onRun }) as React.ReactElement;
    const btn = findInExpanded(el, (e) => e.type === 'button');
    expect(btn).not.toBeNull();
  });

  it('contains the watermark "F"', () => {
    const el = EmptyRuns({}) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' && e.props['aria-hidden'] === 'true' && flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
  });
});

// ===========================================================================
// EmptyFilters VARIANT
// ===========================================================================

describe('EmptyFilters — semantic variant (acceptance criterion: "Limpar filtros")', () => {
  it('renders with title containing "Nenhum resultado"', () => {
    const el = EmptyFilters({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Nenhum resultado');
  });

  it('renders "Limpar filtros" as action label', () => {
    const el = EmptyFilters({}) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Limpar filtros');
  });

  it('renders a link to clearHref when provided', () => {
    const el = EmptyFilters({ clearHref: '/runs' }) as React.ReactElement;
    const link = findInExpanded(el, (e) => e.type === 'a' && e.props.href === '/runs');
    expect(link).not.toBeNull();
  });

  it('contains the watermark "F"', () => {
    const el = EmptyFilters({}) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' && e.props['aria-hidden'] === 'true' && flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
  });
});

// ===========================================================================
// EmptyDLQ VARIANT
// ===========================================================================

describe('EmptyDLQ — positive messaging (acceptance criterion: não alarmante)', () => {
  it('renders with title "Nenhum evento morto"', () => {
    const el = EmptyDLQ() as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Nenhum evento morto');
  });

  it('renders positive description (mentions "bem" or similar)', () => {
    const el = EmptyDLQ() as React.ReactElement;
    const text = expandAndFlattenText(el);
    // Positive messaging — no alarming language
    expect(text).toContain('bem');
    expect(text).not.toContain('erro');
    expect(text).not.toContain('falha crítica');
  });

  it('does NOT render an action button (no action needed for healthy state)', () => {
    const el = EmptyDLQ() as React.ReactElement;
    const btn = findInExpanded(el, (e) => e.type === 'button');
    expect(btn).toBeNull();
  });

  it('contains the watermark "F"', () => {
    const el = EmptyDLQ() as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' && e.props['aria-hidden'] === 'true' && flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
  });
});

// ===========================================================================
// EmptyComparison VARIANT
// ===========================================================================

describe('EmptyComparison — semantic variant', () => {
  it('renders with title "Selecione runs para comparar"', () => {
    const el = EmptyComparison() as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('Selecione runs para comparar');
  });

  it('contains the watermark "F"', () => {
    const el = EmptyComparison() as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' && e.props['aria-hidden'] === 'true' && flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
  });
});

// ===========================================================================
// EmptySearch VARIANT
// ===========================================================================

describe('EmptySearch — semantic variant with dynamic query', () => {
  it('renders with title containing the search query', () => {
    const el = EmptySearch({ query: 'my-pipeline' }) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('my-pipeline');
  });

  it('wraps query in quotes in the title', () => {
    const el = EmptySearch({ query: 'test-query' }) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('"test-query"');
  });

  it('handles empty query string gracefully', () => {
    const el = EmptySearch({ query: '' }) as React.ReactElement;
    expect(el).toBeTruthy();
    const text = expandAndFlattenText(el);
    expect(text).toContain('Nenhum resultado');
  });

  it('handles special characters in query', () => {
    const el = EmptySearch({ query: '<script>' }) as React.ReactElement;
    const text = expandAndFlattenText(el);
    expect(text).toContain('<script>');
  });

  it('contains the watermark "F"', () => {
    const el = EmptySearch({ query: 'test' }) as React.ReactElement;
    const watermark = findInExpanded(
      el,
      (e) => e.type === 'span' && e.props['aria-hidden'] === 'true' && flattenText(e).trim() === 'F',
    );
    expect(watermark).not.toBeNull();
  });
});
