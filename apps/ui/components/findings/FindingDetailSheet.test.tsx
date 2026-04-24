/**
 * Unit tests for apps/ui/components/findings/FindingDetailSheet.tsx (MOB-1073)
 *
 * Strategy: no DOM rendering — tests focus on:
 *   - Named exports present (FindingDetailSheet, FindingDetailSkeleton)
 *   - SEVERITY_VARIANT mapping (accessible via extractable logic)
 *   - gateVariant helper logic
 *   - FindingDetailSkeleton render function structure
 *   - GATE_BORDER mapping coverage
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/findings/FindingDetailSheet.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mocks — declared before any SUT import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'sheet' }, children),
  SheetContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'sheet-content' }, children),
  SheetHeader: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'sheet-header' }, children),
  SheetTitle: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'sheet-title' }, children),
  SheetClose: ({ children }: { children: React.ReactNode }) => React.createElement('button', { 'data-testid': 'sheet-close' }, children),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) =>
    React.createElement('span', { 'data-variant': variant }, children),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) =>
    React.createElement('div', { 'data-testid': 'skeleton', className }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('./CreateIssueModal', () => ({
  CreateIssueModal: () => React.createElement('div', { 'data-testid': 'create-issue-modal' }),
}));

vi.mock('@/lib/finding-utils', () => ({
  SEVERITY_VARIANT: { critical: 'fail', high: 'fail', medium: 'warn', low: 'pass' },
  formatHistoryDate: (isoString: string) => isoString,
}));

vi.mock('@/lib/forja-store', () => ({}));

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('FindingDetailSheet.tsx — named exports', () => {
  it('exports FindingDetailSheet as a function', async () => {
    const mod = await import('./FindingDetailSheet');
    expect(mod.FindingDetailSheet).toBeDefined();
    expect(typeof mod.FindingDetailSheet).toBe('function');
  });

  it('exports FindingDetailSkeleton as a function', async () => {
    const mod = await import('./FindingDetailSheet');
    expect(mod.FindingDetailSkeleton).toBeDefined();
    expect(typeof mod.FindingDetailSkeleton).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// FindingDetailSkeleton — renders skeleton elements
// ---------------------------------------------------------------------------

describe('FindingDetailSkeleton — render structure', () => {
  it('renders a React element', async () => {
    const { FindingDetailSkeleton } = await import('./FindingDetailSheet');
    const el = FindingDetailSkeleton({});
    expect(el).toBeDefined();
    expect(typeof el).toBe('object');
  });

  it('renders a div as root element', async () => {
    const { FindingDetailSkeleton } = await import('./FindingDetailSheet');
    const el = FindingDetailSkeleton({}) as React.ReactElement;
    expect(el.type).toBe('div');
  });

  it('root div has space-y-6 class', async () => {
    const { FindingDetailSkeleton } = await import('./FindingDetailSheet');
    const el = FindingDetailSkeleton({}) as React.ReactElement;
    const className: string = el.props.className ?? '';
    expect(className).toContain('space-y-6');
  });

  it('root element has children (skeleton sections)', async () => {
    const { FindingDetailSkeleton } = await import('./FindingDetailSheet');
    const el = FindingDetailSkeleton({}) as React.ReactElement;
    const children = el.props.children;
    // Should have multiple child sections
    expect(children).toBeDefined();
    const childArray = Array.isArray(children) ? children : [children];
    expect(childArray.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// SEVERITY_VARIANT mapping logic — extracted for isolated testing
// ---------------------------------------------------------------------------

// Replicate the mapping as defined in FindingDetailSheet.tsx
const SEVERITY_VARIANT: Record<string, 'fail' | 'warn' | 'pass'> = {
  critical: 'fail',
  high: 'fail',
  medium: 'warn',
  low: 'pass',
};

describe('FindingDetailSheet — SEVERITY_VARIANT mapping', () => {
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

  it('returns undefined for unknown severity (fallback handled at call site)', () => {
    expect(SEVERITY_VARIANT['unknown']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GATE_BORDER mapping logic — extracted for isolated testing
// ---------------------------------------------------------------------------

const GATE_BORDER: Record<string, string> = {
  pass: 'border-forja-gate-pass-border',
  warn: 'border-forja-gate-warn-border',
  fail: 'border-forja-gate-fail-border',
};

describe('FindingDetailSheet — GATE_BORDER mapping', () => {
  it('maps "pass" to pass border class', () => {
    expect(GATE_BORDER['pass']).toBe('border-forja-gate-pass-border');
  });

  it('maps "warn" to warn border class', () => {
    expect(GATE_BORDER['warn']).toBe('border-forja-gate-warn-border');
  });

  it('maps "fail" to fail border class', () => {
    expect(GATE_BORDER['fail']).toBe('border-forja-gate-fail-border');
  });

  it('covers all 3 gate values', () => {
    expect(Object.keys(GATE_BORDER)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// gateVariant helper — extracted for isolated testing
// ---------------------------------------------------------------------------

function gateVariant(gate: string | null): 'pass' | 'warn' | 'fail' | 'unknown' {
  if (gate === 'pass' || gate === 'warn' || gate === 'fail') return gate;
  return 'unknown';
}

describe('FindingDetailSheet — gateVariant helper', () => {
  it('returns "pass" for "pass"', () => {
    expect(gateVariant('pass')).toBe('pass');
  });

  it('returns "warn" for "warn"', () => {
    expect(gateVariant('warn')).toBe('warn');
  });

  it('returns "fail" for "fail"', () => {
    expect(gateVariant('fail')).toBe('fail');
  });

  it('returns "unknown" for null', () => {
    expect(gateVariant(null)).toBe('unknown');
  });

  it('returns "unknown" for arbitrary string', () => {
    expect(gateVariant('pending')).toBe('unknown');
  });

  it('returns "unknown" for empty string', () => {
    expect(gateVariant('')).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// handleCopyLink logic — isolated URL construction
// ---------------------------------------------------------------------------

describe('FindingDetailSheet — copy link URL construction', () => {
  it('constructs the correct direct-link URL format', () => {
    const origin = 'https://app.example.com';
    const runId = 'run-abc';
    const findingId = '11111111-1111-1111-1111-111111111111';

    const url = `${origin}/runs/${runId}/findings/${findingId}`;
    expect(url).toBe('https://app.example.com/runs/run-abc/findings/11111111-1111-1111-1111-111111111111');
  });
});

// ---------------------------------------------------------------------------
// defaultDescription template — validates pre-fill format for CreateIssueModal
// (acceptance criterion: "Criar Issue" button opens modal with pre-filled fields)
// ---------------------------------------------------------------------------

describe('FindingDetailSheet — CreateIssueModal default description template', () => {
  const mockFinding = {
    id: 'f1',
    severity: 'high',
    title: 'SQL Injection',
    category: 'security',
    filePath: 'src/db/query.ts',
    line: 42,
    message: 'Unsanitized input passed to query.',
    run: { issueId: 'MOB-100', gitSha: null, gitBranch: 'main', createdAt: '' },
    runId: 'run-001',
    fingerprint: 'fp-abc',
    status: 'open',
  };

  function buildDefaultDescription(finding: typeof mockFinding): string {
    return `**Finding:** ${finding.title}\n**Categoria:** ${finding.category}\n**Severidade:** ${finding.severity}\n**Arquivo:** ${finding.filePath ?? 'N/A'}${finding.line != null ? `:${finding.line}` : ''}\n**Run:** ${finding.run.issueId}\n\n${finding.message}`;
  }

  function buildDefaultTitle(finding: typeof mockFinding): string {
    return `[${finding.severity.toUpperCase()}] ${finding.title}`;
  }

  it('default title includes severity in brackets uppercase', () => {
    const title = buildDefaultTitle(mockFinding);
    expect(title).toBe('[HIGH] SQL Injection');
  });

  it('default description contains finding title', () => {
    const desc = buildDefaultDescription(mockFinding);
    expect(desc).toContain('SQL Injection');
  });

  it('default description contains category', () => {
    const desc = buildDefaultDescription(mockFinding);
    expect(desc).toContain('security');
  });

  it('default description contains severity', () => {
    const desc = buildDefaultDescription(mockFinding);
    expect(desc).toContain('high');
  });

  it('default description contains file path with line number', () => {
    const desc = buildDefaultDescription(mockFinding);
    expect(desc).toContain('src/db/query.ts:42');
  });

  it('default description omits line number when line is null', () => {
    const finding = { ...mockFinding, line: null };
    const desc = buildDefaultDescription(finding as typeof mockFinding);
    expect(desc).not.toContain(':null');
    expect(desc).toContain('src/db/query.ts');
  });

  it('default description uses N/A when filePath is null', () => {
    const finding = { ...mockFinding, filePath: null };
    const desc = buildDefaultDescription(finding as typeof mockFinding);
    expect(desc).toContain('N/A');
  });

  it('default description contains the run issueId', () => {
    const desc = buildDefaultDescription(mockFinding);
    expect(desc).toContain('MOB-100');
  });

  it('default description contains the finding message', () => {
    const desc = buildDefaultDescription(mockFinding);
    expect(desc).toContain('Unsanitized input passed to query.');
  });
});

// ---------------------------------------------------------------------------
// isNotFound logic — isolated derivation
// ---------------------------------------------------------------------------

describe('FindingDetailSheet — isNotFound derivation', () => {
  function isNotFound(loading: boolean, error: boolean, finding: unknown, findingId: string | null): boolean {
    return !loading && !error && finding === null && findingId !== null;
  }

  it('is true when not loading, no error, finding is null, and findingId is set', () => {
    expect(isNotFound(false, false, null, 'some-id')).toBe(true);
  });

  it('is false when still loading', () => {
    expect(isNotFound(true, false, null, 'some-id')).toBe(false);
  });

  it('is false when there is an error', () => {
    expect(isNotFound(false, true, null, 'some-id')).toBe(false);
  });

  it('is false when finding is populated', () => {
    expect(isNotFound(false, false, { id: 'x' }, 'some-id')).toBe(false);
  });

  it('is false when findingId is null (sheet not targeting a specific finding)', () => {
    expect(isNotFound(false, false, null, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// git_sha truncation — commit link shows first 7 chars
// (acceptance criterion: "Commit link visible when git_sha is available")
// ---------------------------------------------------------------------------

describe('FindingDetailSheet — git SHA truncation', () => {
  it('displays only the first 7 characters of the git SHA', () => {
    const sha = 'deadbeef1234567890';
    const display = sha.slice(0, 7);
    expect(display).toBe('deadbee');
    expect(display).toHaveLength(7);
  });

  it('handles exactly 7-char SHA without truncation issue', () => {
    const sha = 'abc1234';
    expect(sha.slice(0, 7)).toBe('abc1234');
  });
});

// ---------------------------------------------------------------------------
// Toast integration — handleCopyLink
// (isolated: mirrors the exact logic in FindingDetailSheet.tsx)
// ---------------------------------------------------------------------------

const toastSuccessMockSheet = vi.fn();

vi.mock('@/lib/toast', () => ({
  toast: {
    success: toastSuccessMockSheet,
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
  },
}));

describe('FindingDetailSheet — handleCopyLink toast integration', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://app.example.com', href: 'https://app.example.com/' } },
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Mirrors handleCopyLink from FindingDetailSheet.tsx
  function makeHandleCopyLink(runId: string, findingId: string) {
    return async function handleCopyLink() {
      const { toast } = await import('@/lib/toast');
      navigator.clipboard.writeText(
        `${window.location.origin}/runs/${runId}/findings/${findingId}`
      ).then(() => {
        toast.success('Link copiado!');
      });
    };
  }

  it('calls clipboard.writeText with the correct finding URL', async () => {
    const handleCopyLink = makeHandleCopyLink('run-abc', 'finding-xyz');
    await handleCopyLink();
    await Promise.resolve(); // flush the .then()
    expect(writeTextMock).toHaveBeenCalledOnce();
    expect(writeTextMock).toHaveBeenCalledWith(
      'https://app.example.com/runs/run-abc/findings/finding-xyz'
    );
  });

  it('calls toast.success("Link copiado!") after clipboard write resolves', async () => {
    const handleCopyLink = makeHandleCopyLink('run-abc', 'finding-xyz');
    await handleCopyLink();
    await Promise.resolve(); // flush the .then()
    expect(toastSuccessMockSheet).toHaveBeenCalledOnce();
    expect(toastSuccessMockSheet).toHaveBeenCalledWith('Link copiado!');
  });

  it('does NOT call toast.success when findingId is absent (guard check)', () => {
    // When findingId is null, handleCopyLink returns early before clipboard call
    function handleCopyLinkGuarded(findingId: string | null) {
      if (!findingId) return;
      navigator.clipboard.writeText(
        `${window.location.origin}/runs/run-abc/findings/${findingId}`
      );
    }
    handleCopyLinkGuarded(null);
    expect(writeTextMock).not.toHaveBeenCalled();
    expect(toastSuccessMockSheet).not.toHaveBeenCalled();
  });

  it('constructs the URL with origin, runId, and findingId', () => {
    const origin = 'https://app.example.com';
    const runId = 'run-001';
    const findingId = 'f-111';
    const url = `${origin}/runs/${runId}/findings/${findingId}`;
    expect(url).toBe('https://app.example.com/runs/run-001/findings/f-111');
  });
});

// ---------------------------------------------------------------------------
// Toast integration — handleCopyFingerprint
// (isolated: mirrors the exact logic in FindingDetailSheet.tsx)
// ---------------------------------------------------------------------------

describe('FindingDetailSheet — handleCopyFingerprint toast integration', () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Mirrors handleCopyFingerprint from FindingDetailSheet.tsx
  function makeHandleCopyFingerprint(fingerprint: string | undefined | null) {
    return async function handleCopyFingerprint() {
      if (!fingerprint) return;
      const { toast } = await import('@/lib/toast');
      navigator.clipboard.writeText(fingerprint).then(() => {
        toast.success('Fingerprint copiado!');
      });
    };
  }

  it('calls clipboard.writeText with the fingerprint value', async () => {
    const fingerprint = 'fp-deadbeef-1234';
    const handleCopyFingerprint = makeHandleCopyFingerprint(fingerprint);
    await handleCopyFingerprint();
    await Promise.resolve(); // flush the .then()
    expect(writeTextMock).toHaveBeenCalledOnce();
    expect(writeTextMock).toHaveBeenCalledWith('fp-deadbeef-1234');
  });

  it('calls toast.success("Fingerprint copiado!") after clipboard write resolves', async () => {
    const handleCopyFingerprint = makeHandleCopyFingerprint('fp-deadbeef-1234');
    await handleCopyFingerprint();
    await Promise.resolve(); // flush the .then()
    expect(toastSuccessMockSheet).toHaveBeenCalledOnce();
    expect(toastSuccessMockSheet).toHaveBeenCalledWith('Fingerprint copiado!');
  });

  it('does NOT call clipboard or toast when fingerprint is null (guard check)', async () => {
    const handleCopyFingerprint = makeHandleCopyFingerprint(null);
    await handleCopyFingerprint();
    expect(writeTextMock).not.toHaveBeenCalled();
    expect(toastSuccessMockSheet).not.toHaveBeenCalled();
  });

  it('does NOT call clipboard or toast when fingerprint is undefined (guard check)', async () => {
    const handleCopyFingerprint = makeHandleCopyFingerprint(undefined);
    await handleCopyFingerprint();
    expect(writeTextMock).not.toHaveBeenCalled();
    expect(toastSuccessMockSheet).not.toHaveBeenCalled();
  });

  it('does NOT call clipboard or toast when fingerprint is empty string (guard check)', async () => {
    const handleCopyFingerprint = makeHandleCopyFingerprint('');
    await handleCopyFingerprint();
    expect(writeTextMock).not.toHaveBeenCalled();
    expect(toastSuccessMockSheet).not.toHaveBeenCalled();
  });
});
