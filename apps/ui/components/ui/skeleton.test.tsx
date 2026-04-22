/**
 * Unit tests for apps/ui/components/ui/skeleton.tsx (MOB-1063)
 *
 * Tests without DOM rendering — validates exports, function component
 * structure, shimmer animation classes, and className merging.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/ui/skeleton.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { Skeleton } from './skeleton';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('skeleton.tsx — named exports', () => {
  it('exports Skeleton', () => {
    expect(Skeleton).toBeDefined();
  });

  it('Skeleton is a function (function component)', () => {
    expect(typeof Skeleton).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Skeleton is NOT a forwardRef component (it's a plain function component)
// ---------------------------------------------------------------------------

describe('skeleton.tsx — component type', () => {
  it('Skeleton does not use forwardRef (plain function component)', () => {
    // A plain function component does not carry the react.forward_ref $$typeof
    const asAny = Skeleton as unknown as { $$typeof?: symbol };
    expect(asAny.$$typeof).not.toBe(Symbol.for('react.forward_ref'));
  });
});

// ---------------------------------------------------------------------------
// React element from Skeleton() call
// ---------------------------------------------------------------------------

function getSkeletonElement(
  props: React.HTMLAttributes<HTMLDivElement> = {},
): React.ReactElement {
  return (Skeleton as (props: React.HTMLAttributes<HTMLDivElement>) => React.ReactElement)(props);
}

describe('skeleton.tsx — element structure', () => {
  it('returns a React element with type "div"', () => {
    const el = getSkeletonElement();
    expect(el.type).toBe('div');
  });
});

describe('skeleton.tsx — shimmer animation classes', () => {
  it('applies animate-shimmer class', () => {
    const el = getSkeletonElement();
    const className: string = el.props.className ?? '';
    expect(className).toContain('animate-shimmer');
  });

  it('applies bg-forja-bg-elevated class', () => {
    const el = getSkeletonElement();
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-forja-bg-elevated');
  });

  it('applies rounded-md class', () => {
    const el = getSkeletonElement();
    const className: string = el.props.className ?? '';
    expect(className).toContain('rounded-md');
  });

  it('applies bg-[length:200%_100%] class for gradient sizing', () => {
    const el = getSkeletonElement();
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-[length:200%_100%]');
  });

  it('applies the shimmer gradient background-image class', () => {
    const el = getSkeletonElement();
    const className: string = el.props.className ?? '';
    // The class uses arbitrary value syntax with linear-gradient
    expect(className).toContain('bg-[linear-gradient');
  });
});

describe('skeleton.tsx — className merging', () => {
  it('merges custom className with base shimmer classes', () => {
    const el = getSkeletonElement({ className: 'h-4 w-full' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('h-4');
    expect(className).toContain('w-full');
    expect(className).toContain('animate-shimmer');
    expect(className).toContain('rounded-md');
  });

  it('custom className does not override animate-shimmer', () => {
    const el = getSkeletonElement({ className: 'my-element' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('animate-shimmer');
    expect(className).toContain('my-element');
  });
});

describe('skeleton.tsx — additional props passthrough', () => {
  it('passes data-testid prop through to the div element', () => {
    const el = getSkeletonElement({ 'data-testid': 'skeleton-loader' } as React.HTMLAttributes<HTMLDivElement>);
    expect(el.props['data-testid']).toBe('skeleton-loader');
  });

  it('passes aria-hidden prop through to the div element', () => {
    const el = getSkeletonElement({ 'aria-hidden': 'true' } as React.HTMLAttributes<HTMLDivElement>);
    expect(el.props['aria-hidden']).toBe('true');
  });
});
