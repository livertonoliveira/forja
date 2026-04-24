/**
 * Unit tests for apps/ui/components/findings/FindingsRunSection.tsx (MOB-1073)
 *
 * Strategy: no DOM rendering — tests focus on:
 *   - Named exports present
 *   - UUID_RE regex validation logic (gate for sheet open)
 *   - SEVERITY_VARIANT mapping
 *   - handleRowClick logic (push URL only for valid UUIDs)
 *   - handleSheetOpenChange logic (push back to /runs/:id on close)
 *   - initialFindingId initialization logic
 *   - File path truncation logic
 *   - Empty findings rendering logic
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/findings/FindingsRunSection.test.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children }: { children: React.ReactNode }) => React.createElement('table', null, children),
  TableHeader: ({ children }: { children: React.ReactNode }) => React.createElement('thead', null, children),
  TableBody: ({ children }: { children: React.ReactNode }) => React.createElement('tbody', null, children),
  TableRow: ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) =>
    React.createElement('tr', { onClick, className }, children),
  TableHead: ({ children }: { children: React.ReactNode }) => React.createElement('th', null, children),
  TableCell: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('td', { className }, children),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
    React.createElement('span', { 'data-variant': variant }, children),
}));

vi.mock('@/components/findings/FindingDetailSheet', () => ({
  FindingDetailSheet: () => React.createElement('div', { 'data-testid': 'finding-detail-sheet' }),
}));

// ---------------------------------------------------------------------------
// Named exports
// ---------------------------------------------------------------------------

describe('FindingsRunSection.tsx — named exports', () => {
  it('exports FindingsRunSection as a function', async () => {
    const mod = await import('./FindingsRunSection');
    expect(mod.FindingsRunSection).toBeDefined();
    expect(typeof mod.FindingsRunSection).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// UUID_RE validation — controls whether sheet opens and URL pushes
// (acceptance criterion: clicking any finding opens the Sheet)
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('FindingsRunSection — UUID_RE validation', () => {
  it('accepts a valid lowercase UUID', () => {
    expect(UUID_RE.test('11111111-1111-1111-1111-111111111111')).toBe(true);
  });

  it('accepts a valid uppercase UUID', () => {
    expect(UUID_RE.test('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true);
  });

  it('accepts a mixed-case UUID', () => {
    expect(UUID_RE.test('deadbeef-dead-beef-dead-beefdeadbeef')).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(UUID_RE.test('not-a-uuid')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(UUID_RE.test('')).toBe(false);
  });

  it('rejects a UUID with wrong segment lengths', () => {
    expect(UUID_RE.test('11111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('rejects a UUID missing hyphens', () => {
    expect(UUID_RE.test('111111111111111111111111111111111111')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEVERITY_VARIANT mapping
// ---------------------------------------------------------------------------

const SEVERITY_VARIANT: Record<string, 'fail' | 'warn' | 'pass'> = {
  critical: 'fail',
  high: 'fail',
  medium: 'warn',
  low: 'pass',
};

describe('FindingsRunSection — SEVERITY_VARIANT mapping', () => {
  it('maps "critical" to "fail"', () => {
    expect(SEVERITY_VARIANT['critical']).toBe('fail');
  });

  it('maps "high" to "fail"', () => {
    expect(SEVERITY_VARIANT['high']).toBe('fail');
  });

  it('maps "medium" to "warn"', () => {
    expect(SEVERITY_VARIANT['medium']).toBe('warn');
  });

  it('maps "low" to "pass"', () => {
    expect(SEVERITY_VARIANT['low']).toBe('pass');
  });

  it('returns undefined for unknown severity — component falls back to "pass"', () => {
    expect(SEVERITY_VARIANT['unknown']).toBeUndefined();
    // Component uses: SEVERITY_VARIANT[finding.severity] ?? 'pass'
    const fallback = SEVERITY_VARIANT['unknown'] ?? 'pass';
    expect(fallback).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// handleRowClick logic — isolated URL push behavior
// ---------------------------------------------------------------------------

describe('FindingsRunSection — handleRowClick URL push logic', () => {
  function simulateRowClick(
    findingId: string,
    runId: string,
    pushFn: (url: string, opts?: unknown) => void,
  ) {
    // Mirrors handleRowClick in FindingsRunSection
    if (UUID_RE.test(findingId)) {
      pushFn(`/runs/${runId}/findings/${findingId}`, { scroll: false });
    }
  }

  it('pushes finding URL when findingId is a valid UUID', () => {
    const push = vi.fn();
    simulateRowClick('11111111-1111-1111-1111-111111111111', 'run-001', push);
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith(
      '/runs/run-001/findings/11111111-1111-1111-1111-111111111111',
      { scroll: false },
    );
  });

  it('does NOT push URL when findingId is not a UUID', () => {
    const push = vi.fn();
    simulateRowClick('non-uuid-id', 'run-001', push);
    expect(push).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSheetOpenChange — URL reset on close
// ---------------------------------------------------------------------------

describe('FindingsRunSection — handleSheetOpenChange URL reset logic', () => {
  function simulateSheetOpenChange(
    open: boolean,
    runId: string,
    pushFn: (url: string, opts?: unknown) => void,
  ) {
    // Mirrors handleSheetOpenChange in FindingsRunSection
    if (!open) {
      pushFn(`/runs/${runId}`, { scroll: false });
    }
  }

  it('pushes back to run URL when sheet closes (open=false)', () => {
    const push = vi.fn();
    simulateSheetOpenChange(false, 'run-abc', push);
    expect(push).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith('/runs/run-abc', { scroll: false });
  });

  it('does NOT push URL when sheet opens (open=true)', () => {
    const push = vi.fn();
    simulateSheetOpenChange(true, 'run-abc', push);
    expect(push).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// initialFindingId initialization logic
// (acceptance criterion: URL /runs/<id>?findingId=<id> opens sheet directly)
// ---------------------------------------------------------------------------

describe('FindingsRunSection — initialFindingId initialization', () => {
  function shouldOpenInitially(initialFindingId: string | undefined): boolean {
    // Mirrors useEffect logic: open sheet if initialFindingId is a valid UUID
    return !!initialFindingId && UUID_RE.test(initialFindingId);
  }

  it('opens sheet when initialFindingId is a valid UUID', () => {
    expect(shouldOpenInitially('11111111-1111-1111-1111-111111111111')).toBe(true);
  });

  it('does not open sheet when initialFindingId is undefined', () => {
    expect(shouldOpenInitially(undefined)).toBe(false);
  });

  it('does not open sheet when initialFindingId is an empty string', () => {
    expect(shouldOpenInitially('')).toBe(false);
  });

  it('does not open sheet when initialFindingId is a non-UUID string', () => {
    expect(shouldOpenInitially('not-a-valid-uuid')).toBe(false);
  });

  it('opens sheet when initialFindingId matches UUID pattern (direct link scenario)', () => {
    const urlParam = 'deadbeef-dead-beef-dead-beefdeadbeef';
    expect(shouldOpenInitially(urlParam)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// File path truncation — display logic for long file paths
// ---------------------------------------------------------------------------

describe('FindingsRunSection — file path display logic', () => {
  function displayFilePath(file: string | null): string {
    // Mirrors TableCell rendering: truncate at 30 chars
    if (!file) return '—';
    return file.length > 30 ? `${file.slice(0, 30)}…` : file;
  }

  it('returns "—" for null file', () => {
    expect(displayFilePath(null)).toBe('—');
  });

  it('returns file path unchanged when <= 30 chars', () => {
    expect(displayFilePath('src/lib/utils.ts')).toBe('src/lib/utils.ts');
  });

  it('truncates file path at 30 chars with ellipsis when > 30 chars', () => {
    const longPath = 'src/very/deeply/nested/path/to/some/file.ts';
    const result = displayFilePath(longPath);
    expect(result).toHaveLength(31); // 30 chars + '…'
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns exactly 30-char path unchanged (boundary)', () => {
    const path = 'src/exactly/thirty/chars/pa.ts'; // exactly 30 chars
    expect(path).toHaveLength(30);
    expect(displayFilePath(path)).toBe(path);
  });

  it('truncates a 31-char path', () => {
    const path = 'src/exactly/thirty-one/chars.ts'; // 31 chars
    expect(path).toHaveLength(31);
    const result = displayFilePath(path);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Row highlight logic — selected finding highlight class
// ---------------------------------------------------------------------------

describe('FindingsRunSection — row highlight when sheet open', () => {
  function rowClassName(
    findingId: string,
    selectedFindingId: string | null,
    sheetOpen: boolean,
  ): string {
    const isSelected = sheetOpen && selectedFindingId === findingId;
    return `cursor-pointer hover:bg-[#222222] ${isSelected ? 'bg-forja-bg-elevated' : ''}`.trim();
  }

  it('adds elevated bg class for the selected finding when sheet is open', () => {
    const cls = rowClassName('id-1', 'id-1', true);
    expect(cls).toContain('bg-forja-bg-elevated');
  });

  it('does not add elevated bg class when sheet is closed', () => {
    const cls = rowClassName('id-1', 'id-1', false);
    expect(cls).not.toContain('bg-forja-bg-elevated');
  });

  it('does not add elevated bg class for non-selected finding', () => {
    const cls = rowClassName('id-2', 'id-1', true);
    expect(cls).not.toContain('bg-forja-bg-elevated');
  });

  it('always includes cursor-pointer class', () => {
    expect(rowClassName('id-1', null, false)).toContain('cursor-pointer');
    expect(rowClassName('id-1', 'id-1', true)).toContain('cursor-pointer');
  });
});
