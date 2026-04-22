/**
 * Unit tests for apps/ui/components/ui/button.tsx (MOB-1063)
 *
 * Tests without DOM rendering — validates exports, displayName,
 * forwardRef presence, CVA class generation, asChild prop, and disabled state.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/ui/button.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { Button, buttonVariants } from './button';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('button.tsx — named exports', () => {
  it('exports Button', () => {
    expect(Button).toBeDefined();
  });

  it('exports buttonVariants', () => {
    expect(buttonVariants).toBeDefined();
    expect(typeof buttonVariants).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

describe('button.tsx — displayName', () => {
  it('Button has displayName "Button"', () => {
    expect(Button.displayName).toBe('Button');
  });
});

// ---------------------------------------------------------------------------
// forwardRef
// ---------------------------------------------------------------------------

describe('button.tsx — forwardRef', () => {
  it('Button is a forwardRef component', () => {
    expect((Button as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });
});

// ---------------------------------------------------------------------------
// buttonVariants — CVA function produces correct CSS classes
// ---------------------------------------------------------------------------

describe('button.tsx — buttonVariants() class generation', () => {
  it('default variant includes bg-gold-gradient and h-10 classes', () => {
    const cls = buttonVariants({ variant: 'default', size: 'default' });
    expect(cls).toContain('bg-gold-gradient');
    expect(cls).toContain('h-10');
    expect(cls).toContain('px-4');
  });

  it('outline variant includes border-forja-border-gold and bg-transparent', () => {
    const cls = buttonVariants({ variant: 'outline' });
    expect(cls).toContain('border-forja-border-gold');
    expect(cls).toContain('bg-transparent');
    expect(cls).toContain('text-forja-text-gold');
  });

  it('ghost variant includes bg-transparent and text-forja-text-secondary', () => {
    const cls = buttonVariants({ variant: 'ghost' });
    expect(cls).toContain('bg-transparent');
    expect(cls).toContain('text-forja-text-secondary');
  });

  it('destructive variant includes bg-red-900 and text-red-100', () => {
    const cls = buttonVariants({ variant: 'destructive' });
    expect(cls).toContain('bg-red-900');
    expect(cls).toContain('text-red-100');
  });

  it('size sm includes h-8 and text-xs', () => {
    const cls = buttonVariants({ size: 'sm' });
    expect(cls).toContain('h-8');
    expect(cls).toContain('text-xs');
    expect(cls).toContain('px-3');
  });

  it('size lg includes h-12 and px-8', () => {
    const cls = buttonVariants({ size: 'lg' });
    expect(cls).toContain('h-12');
    expect(cls).toContain('px-8');
  });

  it('size icon includes h-10 and w-10', () => {
    const cls = buttonVariants({ size: 'icon' });
    expect(cls).toContain('h-10');
    expect(cls).toContain('w-10');
  });

  it('all variants include base transition class', () => {
    const variants = ['default', 'outline', 'ghost', 'destructive'] as const;
    for (const variant of variants) {
      const cls = buttonVariants({ variant });
      expect(cls).toContain('inline-flex');
      expect(cls).toContain('items-center');
      expect(cls).toContain('transition-all');
    }
  });

  it('all variants include disabled pointer-events-none class', () => {
    const variants = ['default', 'outline', 'ghost', 'destructive'] as const;
    for (const variant of variants) {
      const cls = buttonVariants({ variant });
      expect(cls).toContain('disabled:pointer-events-none');
      expect(cls).toContain('disabled:opacity-50');
    }
  });

  it('default defaults apply when no args passed', () => {
    const cls = buttonVariants();
    // default variant = 'default', size = 'default'
    expect(cls).toContain('bg-gold-gradient');
    expect(cls).toContain('h-10');
  });
});

// ---------------------------------------------------------------------------
// Button render function — tests via inner render function (no DOM)
// ---------------------------------------------------------------------------

type ButtonRender = (props: Record<string, unknown>, ref: unknown) => React.ReactElement;

function getButtonElement(
  props: Record<string, unknown> = {},
): React.ReactElement {
  const render = (Button as unknown as { render: ButtonRender }).render;
  return render(props, null);
}

describe('button.tsx — render element type', () => {
  it('renders a <button> element by default (asChild=false)', () => {
    const el = getButtonElement({});
    expect(el.type).toBe('button');
  });

  it('renders a Slot element when asChild=true', () => {
    const el = getButtonElement({ asChild: true });
    // Slot from @radix-ui/react-slot is not a plain string element
    expect(el.type).not.toBe('button');
    expect(typeof el.type).not.toBe('string');
  });

  it('passes disabled prop through to the button element', () => {
    const el = getButtonElement({ disabled: true });
    expect(el.props.disabled).toBe(true);
  });

  it('passes aria-label prop through to the button element', () => {
    const el = getButtonElement({ 'aria-label': 'Save changes' });
    expect(el.props['aria-label']).toBe('Save changes');
  });
});

describe('button.tsx — CSS classes from render', () => {
  it('renders with default variant classes', () => {
    const el = getButtonElement({});
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-gold-gradient');
    expect(className).toContain('h-10');
  });

  it('renders with outline variant classes when variant=outline', () => {
    const el = getButtonElement({ variant: 'outline' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('border-forja-border-gold');
    expect(className).toContain('bg-transparent');
  });

  it('merges additional className with variant classes', () => {
    const el = getButtonElement({ className: 'w-full' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('w-full');
    expect(className).toContain('bg-gold-gradient');
  });
});
