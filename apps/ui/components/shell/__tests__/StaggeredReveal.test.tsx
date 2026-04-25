/**
 * Unit tests for apps/ui/components/shell/StaggeredReveal.tsx (MOB-1102)
 *
 * Tests without DOM rendering — validates that StaggeredReveal wraps each
 * child in a div with the correct animationDelay and animationFillMode styles,
 * and the animate-fade-in-up CSS class.
 *
 * Run from monorepo root:
 *   npx vitest run --pool=threads apps/ui/components/shell/__tests__/StaggeredReveal.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { StaggeredReveal } from '../StaggeredReveal';

// ---------------------------------------------------------------------------
// Helper: call StaggeredReveal and collect the wrapper divs from the Fragment
// ---------------------------------------------------------------------------

type WrapperDiv = {
  type: string;
  props: {
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  };
};

function getWrapperDivs(
  children: React.ReactNode,
  staggerMs?: number,
): WrapperDiv[] {
  const el = StaggeredReveal({ children, staggerMs }) as React.ReactElement;
  // StaggeredReveal returns a Fragment — its children are the wrapper divs
  const fragmentChildren = el.props.children as React.ReactElement[];
  if (!Array.isArray(fragmentChildren)) {
    // Single child case
    return [fragmentChildren as unknown as WrapperDiv];
  }
  return fragmentChildren as unknown as WrapperDiv[];
}

// ===========================================================================
// Exports
// ===========================================================================

describe('StaggeredReveal — exports', () => {
  it('exports StaggeredReveal as a function', () => {
    expect(typeof StaggeredReveal).toBe('function');
  });
});

// ===========================================================================
// Basic rendering
// ===========================================================================

describe('StaggeredReveal — renders correct number of wrapper divs', () => {
  it('renders 0 wrappers for 0 children', () => {
    const el = StaggeredReveal({ children: [] }) as React.ReactElement;
    const children = el.props.children as React.ReactElement[];
    expect(children.length).toBe(0);
  });

  it('renders 1 wrapper div for 1 child', () => {
    const child = React.createElement('span', null, 'item1');
    const divs = getWrapperDivs(child);
    expect(divs.length).toBe(1);
  });

  it('renders 3 wrapper divs for 3 children', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
      React.createElement('div', { key: '3' }, 'c'),
    ];
    const divs = getWrapperDivs(children);
    expect(divs.length).toBe(3);
  });
});

// ===========================================================================
// CSS classes (acceptance criterion: animate-fade-in-up on staggered rows)
// ===========================================================================

describe('StaggeredReveal — animate-fade-in-up class', () => {
  it('first wrapper div has animate-fade-in-up class', () => {
    const child = React.createElement('span', null, 'item');
    const divs = getWrapperDivs(child);
    expect(divs[0].props.className).toContain('animate-fade-in-up');
  });

  it('all 3 wrapper divs have animate-fade-in-up class', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
      React.createElement('div', { key: '3' }, 'c'),
    ];
    const divs = getWrapperDivs(children);
    for (const div of divs) {
      expect(div.props.className).toContain('animate-fade-in-up');
    }
  });

  it('merges custom className with animate-fade-in-up', () => {
    const child = React.createElement('span', null, 'item');
    const el = StaggeredReveal({ children: child, className: 'my-custom' }) as React.ReactElement;
    const divs = el.props.children as WrapperDiv[];
    const wrapper = Array.isArray(divs) ? divs[0] : divs;
    expect(wrapper.props.className).toContain('animate-fade-in-up');
    expect(wrapper.props.className).toContain('my-custom');
  });
});

// ===========================================================================
// Animation delays (acceptance criterion: stagger 50ms per child)
// ===========================================================================

describe('StaggeredReveal — animationDelay incremental stagger', () => {
  it('first child has animationDelay "0ms" (i=0, staggerMs=50 → 0*50=0)', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
    ];
    const divs = getWrapperDivs(children, 50);
    expect(divs[0].props.style?.animationDelay).toBe('0ms');
  });

  it('second child has animationDelay "50ms" (i=1, staggerMs=50 → 1*50=50)', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
    ];
    const divs = getWrapperDivs(children, 50);
    expect(divs[1].props.style?.animationDelay).toBe('50ms');
  });

  it('third child has animationDelay "100ms" with default staggerMs=50', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
      React.createElement('div', { key: '3' }, 'c'),
    ];
    const divs = getWrapperDivs(children); // default staggerMs = 50
    expect(divs[2].props.style?.animationDelay).toBe('100ms');
  });

  it('uses custom staggerMs — 100ms per child', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
      React.createElement('div', { key: '3' }, 'c'),
    ];
    const divs = getWrapperDivs(children, 100);
    expect(divs[0].props.style?.animationDelay).toBe('0ms');
    expect(divs[1].props.style?.animationDelay).toBe('100ms');
    expect(divs[2].props.style?.animationDelay).toBe('200ms');
  });

  it('uses default staggerMs=50 when not provided', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
    ];
    // No staggerMs passed — falls back to 50
    const divs = getWrapperDivs(children);
    expect(divs[1].props.style?.animationDelay).toBe('50ms');
  });
});

// ===========================================================================
// animationFillMode (acceptance criterion: correct stagger behavior)
// ===========================================================================

describe('StaggeredReveal — animationFillMode: both', () => {
  it('each wrapper div has animationFillMode "both"', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'a'),
      React.createElement('div', { key: '2' }, 'b'),
    ];
    const divs = getWrapperDivs(children);
    for (const div of divs) {
      expect(div.props.style?.animationFillMode).toBe('both');
    }
  });
});

// ===========================================================================
// Falsy children filtering
// ===========================================================================

describe('StaggeredReveal — filters out falsy children', () => {
  it('ignores null/undefined children (does not create wrapper divs for them)', () => {
    const children = [
      React.createElement('div', { key: '1' }, 'real'),
      null,
      undefined,
    ];
    const el = StaggeredReveal({ children }) as React.ReactElement;
    const divs = el.props.children as WrapperDiv[];
    // Only 1 real child after filtering falsy values
    expect(Array.isArray(divs) ? divs.length : 1).toBe(1);
  });
});

// ===========================================================================
// Children passthrough
// ===========================================================================

describe('StaggeredReveal — wraps original child content', () => {
  it('passes child content through to wrapper div', () => {
    const child = React.createElement('article', null, 'article content');
    const el = StaggeredReveal({ children: child }) as React.ReactElement;
    const divs = el.props.children as WrapperDiv[];
    const wrapper = Array.isArray(divs) ? divs[0] : divs;
    const wrappedChild = wrapper.props.children as React.ReactElement;
    expect(wrappedChild.type).toBe('article');
  });
});
