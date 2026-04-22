/**
 * Integration tests for apps/ui UI components — MOB-1063
 *
 * Covers:
 * - cn() merges class names correctly
 * - cn() handles conditional classes (clsx behavior)
 * - cn() deduplicates conflicting Tailwind classes (tailwind-merge behavior)
 * - card.tsx exports: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
 * - button.tsx exports: Button, buttonVariants
 * - skeleton.tsx exports: Skeleton
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// cn() utility — apps/ui/lib/utils.ts
// ---------------------------------------------------------------------------

import { cn } from '../../apps/ui/lib/utils.ts';

describe('cn() utility', () => {
  it('merges multiple class name strings', () => {
    const result = cn('foo', 'bar', 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('handles a single class name', () => {
    expect(cn('only')).toBe('only');
  });

  it('handles no arguments', () => {
    expect(cn()).toBe('');
  });

  it('handles conditional classes — truthy condition includes the class', () => {
    const active = true;
    const result = cn('base', active && 'active');
    expect(result).toContain('base');
    expect(result).toContain('active');
  });

  it('handles conditional classes — falsy condition excludes the class', () => {
    const active = false;
    const result = cn('base', active && 'active');
    expect(result).toContain('base');
    expect(result).not.toContain('active');
  });

  it('handles undefined and null values gracefully', () => {
    const result = cn('base', undefined, null as unknown as string, 'end');
    expect(result).toBe('base end');
  });

  it('handles object syntax from clsx', () => {
    const result = cn({ foo: true, bar: false, baz: true });
    expect(result).toContain('foo');
    expect(result).not.toContain('bar');
    expect(result).toContain('baz');
  });

  it('handles array syntax from clsx', () => {
    const result = cn(['a', 'b'], 'c');
    expect(result).toBe('a b c');
  });

  // tailwind-merge (twMerge) behavior — last class wins for conflicting utilities
  it('deduplicates conflicting Tailwind padding classes (last wins)', () => {
    const result = cn('p-4', 'p-8');
    expect(result).toBe('p-8');
    expect(result).not.toContain('p-4');
  });

  it('deduplicates conflicting Tailwind text-color classes (last wins)', () => {
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
    expect(result).not.toContain('text-red-500');
  });

  it('deduplicates conflicting Tailwind background-color classes (last wins)', () => {
    const result = cn('bg-white', 'bg-black');
    expect(result).toBe('bg-black');
    expect(result).not.toContain('bg-white');
  });

  it('keeps non-conflicting Tailwind classes side by side', () => {
    const result = cn('p-4', 'm-4', 'text-sm');
    expect(result).toContain('p-4');
    expect(result).toContain('m-4');
    expect(result).toContain('text-sm');
  });

  it('deduplicates conflict when combined with conditional', () => {
    const override = true;
    const result = cn('px-2', override && 'px-6');
    expect(result).toBe('px-6');
    expect(result).not.toContain('px-2');
  });
});

// ---------------------------------------------------------------------------
// Named exports — components/ui/card.tsx
// ---------------------------------------------------------------------------

import * as CardModule from '../../apps/ui/components/ui/card.tsx';

describe('card.tsx named exports', () => {
  it('exports Card', () => {
    expect(CardModule.Card).toBeDefined();
  });

  it('exports CardHeader', () => {
    expect(CardModule.CardHeader).toBeDefined();
  });

  it('exports CardTitle', () => {
    expect(CardModule.CardTitle).toBeDefined();
  });

  it('exports CardDescription', () => {
    expect(CardModule.CardDescription).toBeDefined();
  });

  it('exports CardContent', () => {
    expect(CardModule.CardContent).toBeDefined();
  });

  it('exports CardFooter', () => {
    expect(CardModule.CardFooter).toBeDefined();
  });

  it('all Card sub-components are valid React components (function or forwardRef object)', () => {
    const components = [
      CardModule.Card,
      CardModule.CardHeader,
      CardModule.CardTitle,
      CardModule.CardDescription,
      CardModule.CardContent,
      CardModule.CardFooter,
    ];
    for (const comp of components) {
      // React.forwardRef returns an object with $$typeof, plain components are functions
      const t = typeof comp;
      expect(t === 'function' || t === 'object').toBe(true);
      expect(comp).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Named exports — components/ui/button.tsx
// ---------------------------------------------------------------------------

import * as ButtonModule from '../../apps/ui/components/ui/button.tsx';

describe('button.tsx named exports', () => {
  it('exports Button', () => {
    expect(ButtonModule.Button).toBeDefined();
    // React.forwardRef returns an object with $$typeof symbol, not a plain function
    const t = typeof ButtonModule.Button;
    expect(t === 'function' || t === 'object').toBe(true);
  });

  it('exports buttonVariants', () => {
    expect(ButtonModule.buttonVariants).toBeDefined();
    expect(typeof ButtonModule.buttonVariants).toBe('function');
  });

  it('buttonVariants returns a string for default variant', () => {
    const cls = ButtonModule.buttonVariants();
    expect(typeof cls).toBe('string');
    expect(cls.length).toBeGreaterThan(0);
  });

  it('buttonVariants returns a string for outline variant', () => {
    const cls = ButtonModule.buttonVariants({ variant: 'outline' });
    expect(typeof cls).toBe('string');
    expect(cls.length).toBeGreaterThan(0);
  });

  it('buttonVariants returns a string for ghost variant', () => {
    const cls = ButtonModule.buttonVariants({ variant: 'ghost' });
    expect(typeof cls).toBe('string');
  });

  it('buttonVariants returns a string for destructive variant', () => {
    const cls = ButtonModule.buttonVariants({ variant: 'destructive' });
    expect(typeof cls).toBe('string');
  });

  it('buttonVariants returns a string for sm size', () => {
    const cls = ButtonModule.buttonVariants({ size: 'sm' });
    expect(typeof cls).toBe('string');
    expect(cls).toContain('h-8');
  });

  it('buttonVariants returns a string for lg size', () => {
    const cls = ButtonModule.buttonVariants({ size: 'lg' });
    expect(cls).toContain('h-12');
  });

  it('buttonVariants returns a string for icon size', () => {
    const cls = ButtonModule.buttonVariants({ size: 'icon' });
    expect(cls).toContain('h-10');
    expect(cls).toContain('w-10');
  });
});

// ---------------------------------------------------------------------------
// Named exports — components/ui/skeleton.tsx
// ---------------------------------------------------------------------------

import * as SkeletonModule from '../../apps/ui/components/ui/skeleton.tsx';

describe('skeleton.tsx named exports', () => {
  it('exports Skeleton', () => {
    expect(SkeletonModule.Skeleton).toBeDefined();
    // Skeleton is a plain function component, typeof === 'function'
    const t = typeof SkeletonModule.Skeleton;
    expect(t === 'function' || t === 'object').toBe(true);
  });

  it('Skeleton is the only export', () => {
    const keys = Object.keys(SkeletonModule);
    expect(keys).toEqual(['Skeleton']);
  });
});
