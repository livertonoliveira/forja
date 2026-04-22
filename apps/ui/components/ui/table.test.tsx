/**
 * Unit tests for apps/ui/components/ui/table.tsx (MOB-1064)
 *
 * Tests without DOM rendering — validates exports, displayName,
 * forwardRef presence, element types, and CSS classes for sub-components.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/ui/table.test.tsx
 */

import { describe, it, expect } from 'vitest';
import * as React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './table';

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('table.tsx — named exports', () => {
  it('exports Table', () => {
    expect(Table).toBeDefined();
  });

  it('exports TableHeader', () => {
    expect(TableHeader).toBeDefined();
  });

  it('exports TableBody', () => {
    expect(TableBody).toBeDefined();
  });

  it('exports TableRow', () => {
    expect(TableRow).toBeDefined();
  });

  it('exports TableHead', () => {
    expect(TableHead).toBeDefined();
  });

  it('exports TableCell', () => {
    expect(TableCell).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// displayName
// ---------------------------------------------------------------------------

describe('table.tsx — displayName', () => {
  it('Table has displayName "Table"', () => {
    expect(Table.displayName).toBe('Table');
  });

  it('TableHeader has displayName "TableHeader"', () => {
    expect(TableHeader.displayName).toBe('TableHeader');
  });

  it('TableBody has displayName "TableBody"', () => {
    expect(TableBody.displayName).toBe('TableBody');
  });

  it('TableRow has displayName "TableRow"', () => {
    expect(TableRow.displayName).toBe('TableRow');
  });

  it('TableHead has displayName "TableHead"', () => {
    expect(TableHead.displayName).toBe('TableHead');
  });

  it('TableCell has displayName "TableCell"', () => {
    expect(TableCell.displayName).toBe('TableCell');
  });
});

// ---------------------------------------------------------------------------
// forwardRef — all sub-components use React.forwardRef
// ---------------------------------------------------------------------------

describe('table.tsx — forwardRef', () => {
  it('Table is a forwardRef component', () => {
    expect((Table as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('TableHeader is a forwardRef component', () => {
    expect((TableHeader as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('TableBody is a forwardRef component', () => {
    expect((TableBody as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('TableRow is a forwardRef component', () => {
    expect((TableRow as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('TableHead is a forwardRef component', () => {
    expect((TableHead as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
  });

  it('TableCell is a forwardRef component', () => {
    expect((TableCell as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.forward_ref'),
    );
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
// Table — renders a wrapper div + table element
// ---------------------------------------------------------------------------

describe('table.tsx — Table render', () => {
  it('Table renders a wrapper div containing a table', () => {
    const el = renderComp(Table);
    // Table wraps in a div for overflow
    expect(el.type).toBe('div');
    expect(el.props.className).toContain('overflow-auto');
    // The table itself is a child of the wrapper div
    const tableEl = el.props.children;
    expect(tableEl.type).toBe('table');
  });

  it('Table inner element includes w-full and text-sm classes', () => {
    const el = renderComp(Table);
    const tableEl = el.props.children;
    const className: string = tableEl.props.className ?? '';
    expect(className).toContain('w-full');
    expect(className).toContain('text-sm');
  });

  it('Table merges custom className into the inner table element', () => {
    const el = renderComp(Table, { className: 'my-table' });
    const tableEl = el.props.children;
    const className: string = tableEl.props.className ?? '';
    expect(className).toContain('my-table');
    expect(className).toContain('w-full');
  });
});

// ---------------------------------------------------------------------------
// TableHeader — renders a <thead>
// ---------------------------------------------------------------------------

describe('table.tsx — TableHeader render', () => {
  it('TableHeader renders a <thead> element', () => {
    const el = renderComp(TableHeader);
    expect(el.type).toBe('thead');
  });

  it('TableHeader passes custom className through', () => {
    const el = renderComp(TableHeader, { className: 'header-class' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('header-class');
  });
});

// ---------------------------------------------------------------------------
// TableBody — renders a <tbody> with zebra stripe classes
// ---------------------------------------------------------------------------

describe('table.tsx — TableBody render (zebra stripes)', () => {
  it('TableBody renders a <tbody> element', () => {
    const el = renderComp(TableBody);
    expect(el.type).toBe('tbody');
  });

  it('TableBody includes zebra stripe even-row class', () => {
    const el = renderComp(TableBody);
    const className: string = el.props.className ?? '';
    expect(className).toContain('[&_tr:nth-child(even)]:bg-forja-bg-surface');
  });

  it('TableBody includes zebra stripe odd-row class', () => {
    const el = renderComp(TableBody);
    const className: string = el.props.className ?? '';
    expect(className).toContain('[&_tr:nth-child(odd)]:bg-forja-bg-base');
  });

  it('TableBody merges custom className with zebra stripe classes', () => {
    const el = renderComp(TableBody, { className: 'my-body' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('my-body');
    expect(className).toContain('[&_tr:nth-child(even)]:bg-forja-bg-surface');
  });
});

// ---------------------------------------------------------------------------
// TableRow — renders a <tr> with hover classes
// ---------------------------------------------------------------------------

describe('table.tsx — TableRow render (hover classes)', () => {
  it('TableRow renders a <tr> element', () => {
    const el = renderComp(TableRow);
    expect(el.type).toBe('tr');
  });

  it('TableRow includes hover class', () => {
    const el = renderComp(TableRow);
    const className: string = el.props.className ?? '';
    expect(className).toContain('hover:bg-forja-bg-overlay');
  });

  it('TableRow includes border class', () => {
    const el = renderComp(TableRow);
    const className: string = el.props.className ?? '';
    expect(className).toContain('border-b');
    expect(className).toContain('border-forja-border-subtle');
  });

  it('TableRow includes transition-colors class', () => {
    const el = renderComp(TableRow);
    const className: string = el.props.className ?? '';
    expect(className).toContain('transition-colors');
  });

  it('TableRow merges custom className', () => {
    const el = renderComp(TableRow, { className: 'selected' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('selected');
    expect(className).toContain('hover:bg-forja-bg-overlay');
  });
});

// ---------------------------------------------------------------------------
// TableHead — renders a <th> with gold text and mono font
// ---------------------------------------------------------------------------

describe('table.tsx — TableHead render', () => {
  it('TableHead renders a <th> element', () => {
    const el = renderComp(TableHead);
    expect(el.type).toBe('th');
  });

  it('TableHead includes text-forja-text-gold class', () => {
    const el = renderComp(TableHead);
    const className: string = el.props.className ?? '';
    expect(className).toContain('text-forja-text-gold');
  });

  it('TableHead includes font-mono and uppercase classes', () => {
    const el = renderComp(TableHead);
    const className: string = el.props.className ?? '';
    expect(className).toContain('font-mono');
    expect(className).toContain('uppercase');
  });

  it('TableHead includes px-4 and h-10 classes', () => {
    const el = renderComp(TableHead);
    const className: string = el.props.className ?? '';
    expect(className).toContain('px-4');
    expect(className).toContain('h-10');
  });
});

// ---------------------------------------------------------------------------
// TableCell — renders a <td> with primary text and padding
// ---------------------------------------------------------------------------

describe('table.tsx — TableCell render', () => {
  it('TableCell renders a <td> element', () => {
    const el = renderComp(TableCell);
    expect(el.type).toBe('td');
  });

  it('TableCell includes text-forja-text-primary class', () => {
    const el = renderComp(TableCell);
    const className: string = el.props.className ?? '';
    expect(className).toContain('text-forja-text-primary');
  });

  it('TableCell includes px-4 and py-3 padding classes', () => {
    const el = renderComp(TableCell);
    const className: string = el.props.className ?? '';
    expect(className).toContain('px-4');
    expect(className).toContain('py-3');
  });

  it('TableCell merges custom className', () => {
    const el = renderComp(TableCell, { className: 'text-right' });
    const className: string = el.props.className ?? '';
    expect(className).toContain('text-right');
    expect(className).toContain('text-forja-text-primary');
  });
});
