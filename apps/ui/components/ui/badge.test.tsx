/**
 * Unit tests for apps/ui/components/ui/badge.tsx (MOB-1064)
 *
 * Tests without DOM rendering — validates exports, displayName,
 * forwardRef presence, CVA class generation, role, aria-label, and variants.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/ui/badge.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { Badge, badgeVariants } from './badge';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('badge.tsx — named exports', () => {
  it('exports Badge', () => {
    expect(Badge).toBeDefined();
  });

  it('exports badgeVariants', () => {
    expect(badgeVariants).toBeDefined();
    expect(typeof badgeVariants).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

describe('badge.tsx — displayName', () => {
  it('Badge has displayName "Badge"', () => {
    expect(Badge.displayName).toBe('Badge');
  });
});

// ---------------------------------------------------------------------------
// forwardRef
// ---------------------------------------------------------------------------

describe('badge.tsx — forwardRef', () => {
  it('Badge is a forwardRef component', () => {
    expect((Badge as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });
});

// ---------------------------------------------------------------------------
// badgeVariants — CVA function produces correct CSS classes
// ---------------------------------------------------------------------------

describe('badge.tsx — badgeVariants() class generation', () => {
  it('pass variant includes bg-forja-gate-pass-bg and border-forja-gate-pass-border classes', () => {
    const cls = badgeVariants({ variant: 'pass' });
    expect(cls).toContain('bg-forja-gate-pass-bg');
    expect(cls).toContain('border-forja-gate-pass-border');
    expect(cls).toContain('text-forja-gate-pass-text');
  });

  it('warn variant includes bg-forja-gate-warn-bg and border-forja-gate-warn-border classes', () => {
    const cls = badgeVariants({ variant: 'warn' });
    expect(cls).toContain('bg-forja-gate-warn-bg');
    expect(cls).toContain('border-forja-gate-warn-border');
    expect(cls).toContain('text-forja-gate-warn-text');
  });

  it('fail variant includes bg-forja-gate-fail-bg and border-forja-gate-fail-border classes', () => {
    const cls = badgeVariants({ variant: 'fail' });
    expect(cls).toContain('bg-forja-gate-fail-bg');
    expect(cls).toContain('border-forja-gate-fail-border');
    expect(cls).toContain('text-forja-gate-fail-text');
  });

  it('unknown variant includes bg-forja-gate-unknown-bg and border-forja-gate-unknown-border classes', () => {
    const cls = badgeVariants({ variant: 'unknown' });
    expect(cls).toContain('bg-forja-gate-unknown-bg');
    expect(cls).toContain('border-forja-gate-unknown-border');
    expect(cls).toContain('text-forja-gate-unknown-text');
  });

  it('default variant includes bg-forja-bg-surface and border-forja-border-subtle classes', () => {
    const cls = badgeVariants({ variant: 'default' });
    expect(cls).toContain('bg-forja-bg-surface');
    expect(cls).toContain('border-forja-border-subtle');
    expect(cls).toContain('text-forja-text-secondary');
  });

  it('all variants include base inline-flex and font-mono classes', () => {
    const variants = ['pass', 'warn', 'fail', 'unknown', 'default'] as const;
    for (const variant of variants) {
      const cls = badgeVariants({ variant });
      expect(cls).toContain('inline-flex');
      expect(cls).toContain('items-center');
      expect(cls).toContain('font-mono');
      expect(cls).toContain('rounded');
    }
  });

  it('default defaults apply when no args passed', () => {
    const cls = badgeVariants();
    // default variant = 'default'
    expect(cls).toContain('bg-forja-bg-surface');
    expect(cls).toContain('border-forja-border-subtle');
  });
});

// ---------------------------------------------------------------------------
// Badge render function — test via inner render function (no DOM)
// ---------------------------------------------------------------------------

type BadgeRender = (props: Record<string, unknown>, ref: unknown) => React.ReactElement;

function getBadgeElement(
  props: Record<string, unknown> = {},
): React.ReactElement {
  const render = (Badge as unknown as { render: BadgeRender }).render;
  return render(props, null);
}

describe('badge.tsx — render element type', () => {
  it('renders a <span> element by default', () => {
    const el = getBadgeElement({});
    expect(el.type).toBe('span');
  });

  it('passes aria-label prop through when explicitly provided', () => {
    const el = getBadgeElement({ 'aria-label': 'custom label' });
    expect(el.props['aria-label']).toBe('custom label');
  });
});

describe('badge.tsx — role="status"', () => {
  it('has role="status" for pass variant', () => {
    const el = getBadgeElement({ variant: 'pass' });
    expect(el.props.role).toBe('status');
  });

  it('has role="status" for warn variant', () => {
    const el = getBadgeElement({ variant: 'warn' });
    expect(el.props.role).toBe('status');
  });

  it('has role="status" for fail variant', () => {
    const el = getBadgeElement({ variant: 'fail' });
    expect(el.props.role).toBe('status');
  });

  it('has role="status" for unknown variant', () => {
    const el = getBadgeElement({ variant: 'unknown' });
    expect(el.props.role).toBe('status');
  });

  it('does not have role="status" for default variant', () => {
    const el = getBadgeElement({ variant: 'default' });
    expect(el.props.role).toBeUndefined();
  });
});

describe('badge.tsx — default aria-label for gate variants', () => {
  it('has aria-label="gate: pass" for pass variant when no explicit aria-label', () => {
    const el = getBadgeElement({ variant: 'pass' });
    expect(el.props['aria-label']).toBe('gate: pass');
  });

  it('has aria-label="gate: warn" for warn variant when no explicit aria-label', () => {
    const el = getBadgeElement({ variant: 'warn' });
    expect(el.props['aria-label']).toBe('gate: warn');
  });

  it('has aria-label="gate: fail" for fail variant when no explicit aria-label', () => {
    const el = getBadgeElement({ variant: 'fail' });
    expect(el.props['aria-label']).toBe('gate: fail');
  });

  it('has aria-label="gate: unknown" for unknown variant when no explicit aria-label', () => {
    const el = getBadgeElement({ variant: 'unknown' });
    expect(el.props['aria-label']).toBe('gate: unknown');
  });

  it('has no auto aria-label for default variant', () => {
    const el = getBadgeElement({ variant: 'default' });
    expect(el.props['aria-label']).toBeUndefined();
  });
});

describe('badge.tsx — aria-label override', () => {
  it('explicit aria-label overrides the auto gate label for pass variant', () => {
    const el = getBadgeElement({ variant: 'pass', 'aria-label': 'my custom label' });
    expect(el.props['aria-label']).toBe('my custom label');
  });

  it('explicit aria-label overrides the auto gate label for fail variant', () => {
    const el = getBadgeElement({ variant: 'fail', 'aria-label': 'pipeline failed' });
    expect(el.props['aria-label']).toBe('pipeline failed');
  });
});

describe('badge.tsx — CSS classes from render', () => {
  it('renders with pass variant classes', () => {
    const el = getBadgeElement({ variant: 'pass' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-forja-gate-pass-bg');
    expect(className).toContain('border-forja-gate-pass-border');
  });

  it('renders with warn variant classes', () => {
    const el = getBadgeElement({ variant: 'warn' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-forja-gate-warn-bg');
  });

  it('renders with fail variant classes', () => {
    const el = getBadgeElement({ variant: 'fail' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-forja-gate-fail-bg');
  });

  it('renders with default variant classes when no variant specified', () => {
    const el = getBadgeElement({});
    const className: string = el.props.className ?? '';
    expect(className).toContain('bg-forja-bg-surface');
  });

  it('merges additional className with variant classes', () => {
    const el = getBadgeElement({ className: 'uppercase' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('uppercase');
    expect(className).toContain('bg-forja-bg-surface');
  });
});
