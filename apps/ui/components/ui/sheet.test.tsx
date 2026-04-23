/**
 * Unit tests for apps/ui/components/ui/sheet.tsx (MOB-1064)
 *
 * Smoke tests — Sheet is built on Radix UI Dialog primitives, so we focus on:
 *   - exports (all 6 named exports present)
 *   - forwardRef wrappers (SheetContent, SheetHeader, SheetTitle)
 *   - displayName values
 *   - CSS classes from SheetHeader and SheetTitle render functions (no DOM needed)
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/ui/sheet.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from './sheet';

// ---------------------------------------------------------------------------
// Exports — all 6 named exports must be defined
// ---------------------------------------------------------------------------

describe('sheet.tsx — named exports', () => {
  it('exports Sheet', () => {
    expect(Sheet).toBeDefined();
  });

  it('exports SheetTrigger', () => {
    expect(SheetTrigger).toBeDefined();
  });

  it('exports SheetContent', () => {
    expect(SheetContent).toBeDefined();
  });

  it('exports SheetHeader', () => {
    expect(SheetHeader).toBeDefined();
  });

  it('exports SheetTitle', () => {
    expect(SheetTitle).toBeDefined();
  });

  it('exports SheetClose', () => {
    expect(SheetClose).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// displayName — forwardRef-wrapped components
// ---------------------------------------------------------------------------

describe('sheet.tsx — displayName', () => {
  it('SheetContent has displayName "SheetContent"', () => {
    expect(SheetContent.displayName).toBe('SheetContent');
  });

  it('SheetHeader has displayName "SheetHeader"', () => {
    expect(SheetHeader.displayName).toBe('SheetHeader');
  });

  it('SheetTitle has displayName "SheetTitle"', () => {
    expect(SheetTitle.displayName).toBe('SheetTitle');
  });
});

// ---------------------------------------------------------------------------
// forwardRef — SheetContent, SheetHeader and SheetTitle use forwardRef
// ---------------------------------------------------------------------------

describe('sheet.tsx — forwardRef', () => {
  it('SheetContent is a forwardRef component', () => {
    expect((SheetContent as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('SheetHeader is a forwardRef component', () => {
    expect((SheetHeader as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('SheetTitle is a forwardRef component', () => {
    expect((SheetTitle as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });
});

// ---------------------------------------------------------------------------
// Component types — Sheet, SheetTrigger, SheetClose are Radix primitives
// (not plain string types, not forwardRef wrappers created by us)
// ---------------------------------------------------------------------------

describe('sheet.tsx — Radix primitive components are callable', () => {
  it('Sheet is a non-null object or function (Radix Root)', () => {
    // Radix Root is an object with render logic
    expect(Sheet).not.toBeNull();
    expect(typeof Sheet === 'function' || typeof Sheet === 'object').toBe(true);
  });

  it('SheetTrigger is a non-null object or function (Radix Trigger)', () => {
    expect(SheetTrigger).not.toBeNull();
    expect(typeof SheetTrigger === 'function' || typeof SheetTrigger === 'object').toBe(true);
  });

  it('SheetClose is a non-null object or function (Radix Close)', () => {
    expect(SheetClose).not.toBeNull();
    expect(typeof SheetClose === 'function' || typeof SheetClose === 'object').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Utility — invoke forwardRef render function without DOM
// ---------------------------------------------------------------------------

type RenderFn = (props: Record<string, unknown>, ref: unknown) => React.ReactElement;

function renderComp(
  Component: unknown,
  props: Record<string, unknown> = {},
): React.ReactElement {
  const render = (Component as { render: RenderFn }).render;
  return render(props, null);
}

// ---------------------------------------------------------------------------
// SheetHeader — renders a <div> with layout classes
// ---------------------------------------------------------------------------

describe('sheet.tsx — SheetHeader render', () => {
  it('SheetHeader renders a <div> element', () => {
    const el = renderComp(SheetHeader);
    expect(el.type).toBe('div');
  });

  it('SheetHeader includes flex and flex-col classes', () => {
    const el = renderComp(SheetHeader);
    const className: string = el.props.className ?? '';
    expect(className).toContain('flex');
    expect(className).toContain('flex-col');
  });

  it('SheetHeader includes mb-6 spacing class', () => {
    const el = renderComp(SheetHeader);
    const className: string = el.props.className ?? '';
    expect(className).toContain('mb-6');
  });

  it('SheetHeader merges custom className', () => {
    const el = renderComp(SheetHeader, { className: 'pb-4' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('pb-4');
    expect(className).toContain('flex-col');
  });
});

// ---------------------------------------------------------------------------
// SheetTitle — renders a Radix Title with gold text classes
// ---------------------------------------------------------------------------

describe('sheet.tsx — SheetTitle render', () => {
  it('SheetTitle render function returns a React element', () => {
    const el = renderComp(SheetTitle);
    expect(el).toBeDefined();
    expect(typeof el).toBe('object');
  });

  it('SheetTitle includes text-forja-text-gold class', () => {
    const el = renderComp(SheetTitle);
    const className: string = el.props.className ?? '';
    expect(className).toContain('text-forja-text-gold');
  });

  it('SheetTitle includes font-sans and font-semibold classes', () => {
    const el = renderComp(SheetTitle);
    const className: string = el.props.className ?? '';
    expect(className).toContain('font-sans');
    expect(className).toContain('font-semibold');
  });

  it('SheetTitle includes text-xl class', () => {
    const el = renderComp(SheetTitle);
    const className: string = el.props.className ?? '';
    expect(className).toContain('text-xl');
  });

  it('SheetTitle merges custom className', () => {
    const el = renderComp(SheetTitle, { className: 'truncate' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('truncate');
    expect(className).toContain('text-forja-text-gold');
  });
});
