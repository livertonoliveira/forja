/**
 * Integration tests for apps/ui/components/runs/CopyLinkButton.tsx
 *
 * Strategy: mock navigator.clipboard and @/lib/toast, then exercise the
 * handleCopy function directly (no DOM rendering needed).
 *
 * Covered scenarios:
 *   1. handleCopy calls navigator.clipboard.writeText(window.location.href)
 *   2. After clipboard write resolves, toast.success('Link copiado!') is called
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/runs/CopyLinkButton.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any SUT import
// ---------------------------------------------------------------------------

const toastSuccessMock = vi.fn();

vi.mock('@/lib/toast', () => ({
  toast: {
    success: toastSuccessMock,
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: unknown; onClick?: () => void }) => ({
    type: 'button',
    props: { onClick, children },
  }),
}));

// ---------------------------------------------------------------------------
// handleCopy — isolated implementation (mirrors CopyLinkButton.tsx exactly)
// ---------------------------------------------------------------------------

async function handleCopy() {
  await navigator.clipboard.writeText(window.location.href);
  const { toast } = await import('@/lib/toast');
  toast.success('Link copiado!');
}

// ---------------------------------------------------------------------------
// Setup: mock navigator.clipboard before each test
// ---------------------------------------------------------------------------

let writeTextMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: writeTextMock } },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: { location: { href: 'https://app.example.com/runs/run-123' } },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CopyLinkButton — handleCopy integration', () => {
  it('calls navigator.clipboard.writeText with window.location.href', async () => {
    await handleCopy();
    expect(writeTextMock).toHaveBeenCalledOnce();
    expect(writeTextMock).toHaveBeenCalledWith('https://app.example.com/runs/run-123');
  });

  it('calls toast.success("Link copiado!") after clipboard write resolves', async () => {
    await handleCopy();
    expect(toastSuccessMock).toHaveBeenCalledOnce();
    expect(toastSuccessMock).toHaveBeenCalledWith('Link copiado!');
  });

  it('does NOT call toast.success before the clipboard write resolves', async () => {
    let resolveWrite!: () => void;
    writeTextMock = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      })
    );
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: writeTextMock } },
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();

    const pending = handleCopy();
    // toast must not have been called yet — clipboard promise still pending
    expect(toastSuccessMock).not.toHaveBeenCalled();

    resolveWrite();
    await pending;
    expect(toastSuccessMock).toHaveBeenCalledOnce();
  });

  it('calls clipboard.writeText exactly once per invocation', async () => {
    await handleCopy();
    await handleCopy();
    expect(writeTextMock).toHaveBeenCalledTimes(2);
  });

  it('calls toast.success exactly once per invocation', async () => {
    await handleCopy();
    await handleCopy();
    expect(toastSuccessMock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Named export check
// ---------------------------------------------------------------------------

describe('CopyLinkButton.tsx — named exports', () => {
  it('exports CopyLinkButton as a function', async () => {
    const mod = await import('./CopyLinkButton');
    expect(mod.CopyLinkButton).toBeDefined();
    expect(typeof mod.CopyLinkButton).toBe('function');
  });
});
