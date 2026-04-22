/**
 * Unit tests for apps/ui/components/ui/card.tsx (MOB-1063)
 *
 * Tests without DOM rendering — validates exports, displayName,
 * forwardRef presence, CVA class generation, and sub-component structure.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/ui/card.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('card.tsx — named exports', () => {
  it('exports Card', () => {
    expect(Card).toBeDefined();
  });

  it('exports CardHeader', () => {
    expect(CardHeader).toBeDefined();
  });

  it('exports CardTitle', () => {
    expect(CardTitle).toBeDefined();
  });

  it('exports CardDescription', () => {
    expect(CardDescription).toBeDefined();
  });

  it('exports CardContent', () => {
    expect(CardContent).toBeDefined();
  });

  it('exports CardFooter', () => {
    expect(CardFooter).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// displayName — confirms forwardRef wrapping and identity
// ---------------------------------------------------------------------------

describe('card.tsx — displayName', () => {
  it('Card has displayName "Card"', () => {
    expect(Card.displayName).toBe('Card');
  });

  it('CardHeader has displayName "CardHeader"', () => {
    expect(CardHeader.displayName).toBe('CardHeader');
  });

  it('CardTitle has displayName "CardTitle"', () => {
    expect(CardTitle.displayName).toBe('CardTitle');
  });

  it('CardDescription has displayName "CardDescription"', () => {
    expect(CardDescription.displayName).toBe('CardDescription');
  });

  it('CardContent has displayName "CardContent"', () => {
    expect(CardContent.displayName).toBe('CardContent');
  });

  it('CardFooter has displayName "CardFooter"', () => {
    expect(CardFooter.displayName).toBe('CardFooter');
  });
});

// ---------------------------------------------------------------------------
// forwardRef — components created with React.forwardRef expose $$typeof
// ---------------------------------------------------------------------------

describe('card.tsx — forwardRef', () => {
  it('Card is a forwardRef component', () => {
    expect((Card as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('CardHeader is a forwardRef component', () => {
    expect((CardHeader as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('CardTitle is a forwardRef component', () => {
    expect((CardTitle as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('CardDescription is a forwardRef component', () => {
    expect((CardDescription as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('CardContent is a forwardRef component', () => {
    expect((CardContent as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('CardFooter is a forwardRef component', () => {
    expect((CardFooter as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });
});

// ---------------------------------------------------------------------------
// CVA class generation — test the variant classes produced by cardVariants
// We import the CVA helper indirectly by inspecting the render function's
// source via React.createElement props (no DOM needed).
//
// Strategy: call React.createElement and inspect the className prop produced
// by the component's render function via a fake ref + props object.
// ---------------------------------------------------------------------------

/**
 * Utility: invoke a forwardRef component's inner render function with the
 * given props and a null ref, and return the resulting React element.
 */
function renderElement(
  Component: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & { variant?: string; className?: string }>,
  props: Record<string, unknown> = {},
): React.ReactElement {
  // Access the underlying render function of a forwardRef component
  const render = (Component as unknown as { render: (props: unknown, ref: unknown) => React.ReactElement }).render;
  return render(props, null);
}

describe('card.tsx — CSS classes (default variant)', () => {
  it('Card default variant includes base surface and border classes', () => {
    const el = renderElement(Card as React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & { variant?: string; className?: string }>);
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-forja-bg-surface');
    expect(className).toContain('border-forja-border-subtle');
    expect(className).toContain('rounded-lg');
    expect(className).toContain('shadow-surface');
  });

  it('Card default variant does NOT include premium gradient classes', () => {
    const el = renderElement(Card as React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & { variant?: string; className?: string }>);
    const className: string = el.props.className ?? '';
    expect(className).not.toContain('bg-gradient-to-br');
  });
});

describe('card.tsx — CSS classes (premium variant)', () => {
  it('Card premium variant includes gradient and backdrop-blur classes', () => {
    const el = renderElement(
      Card as React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & { variant?: string; className?: string }>,
      { variant: 'premium' },
    );
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-gradient-to-br');
    expect(className).toContain('backdrop-blur-sm');
  });

  it('Card premium variant includes forja-bg-surface token in gradient stops', () => {
    const el = renderElement(
      Card as React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & { variant?: string; className?: string }>,
      { variant: 'premium' },
    );
    const className: string = el.props.className ?? '';
    // tailwind-merge drops bg-forja-bg-surface in favor of bg-gradient-to-br,
    // but the surface token appears in the from-/to- gradient stop classes
    expect(className).toContain('from-forja-bg-surface');
    expect(className).toContain('to-forja-bg-surface');
  });
});

describe('card.tsx — custom className merging', () => {
  it('Card merges a custom className without duplicating base classes', () => {
    const el = renderElement(
      Card as React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLElement> & { variant?: string; className?: string }>,
      { className: 'my-custom-class' },
    );
    const className: string = el.props.className ?? '';
    expect(className).toContain('my-custom-class');
    expect(className).toContain('rounded-lg');
  });
});

describe('card.tsx — sub-component structural classes', () => {
  it('CardHeader render returns a div with p-6 and flex-col classes', () => {
    const render = (CardHeader as unknown as { render: (props: unknown, ref: unknown) => React.ReactElement }).render;
    const el = render({}, null);
    const className: string = el.props.className ?? '';
    expect(className).toContain('p-6');
    expect(className).toContain('flex-col');
  });

  it('CardContent render returns a div with p-6 and pt-0 classes', () => {
    const render = (CardContent as unknown as { render: (props: unknown, ref: unknown) => React.ReactElement }).render;
    const el = render({}, null);
    const className: string = el.props.className ?? '';
    expect(className).toContain('p-6');
    expect(className).toContain('pt-0');
  });

  it('CardFooter render returns a div with flex, items-center, p-6, and pt-0 classes', () => {
    const render = (CardFooter as unknown as { render: (props: unknown, ref: unknown) => React.ReactElement }).render;
    const el = render({}, null);
    const className: string = el.props.className ?? '';
    expect(className).toContain('flex');
    expect(className).toContain('items-center');
    expect(className).toContain('p-6');
    expect(className).toContain('pt-0');
  });

  it('CardTitle render returns an element with text-forja-text-primary and font-semibold', () => {
    const render = (CardTitle as unknown as { render: (props: unknown, ref: unknown) => React.ReactElement }).render;
    const el = render({}, null);
    const className: string = el.props.className ?? '';
    expect(className).toContain('text-forja-text-primary');
    expect(className).toContain('font-semibold');
  });

  it('CardDescription render returns an element with text-forja-text-secondary and text-sm', () => {
    const render = (CardDescription as unknown as { render: (props: unknown, ref: unknown) => React.ReactElement }).render;
    const el = render({}, null);
    const className: string = el.props.className ?? '';
    expect(className).toContain('text-forja-text-secondary');
    expect(className).toContain('text-sm');
  });
});
