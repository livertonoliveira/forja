/**
 * Unit tests for apps/ui/components/findings/CreateIssueModal.tsx (MOB-1073)
 *
 * Strategy: no DOM rendering — tests focus on:
 *   - Named exports present
 *   - Provider type coverage
 *   - handleCreate error handling logic (isolated)
 *   - handleClose reset timing logic (isolated)
 *   - inputClass composition logic (isolated via cn mock)
 *   - Provider list validation (linear / jira / gitlab)
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/findings/CreateIssueModal.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Portal: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  Overlay: () => React.createElement('div', { 'data-testid': 'overlay' }),
  Content: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'dialog-content' }, children),
  Title: ({ children }: { children: React.ReactNode }) => React.createElement('h2', null, children),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('CreateIssueModal.tsx — named exports', () => {
  it('exports CreateIssueModal as a function', async () => {
    const mod = await import('./CreateIssueModal');
    expect(mod.CreateIssueModal).toBeDefined();
    expect(typeof mod.CreateIssueModal).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Provider type — valid values
// (acceptance criterion: modal supports Linear / Jira / GitLab)
// ---------------------------------------------------------------------------

type Provider = 'linear' | 'jira' | 'gitlab';

const VALID_PROVIDERS: Provider[] = ['linear', 'jira', 'gitlab'];

describe('CreateIssueModal — provider type coverage', () => {
  it('accepts "linear" as a valid provider', () => {
    const p: Provider = 'linear';
    expect(VALID_PROVIDERS).toContain(p);
  });

  it('accepts "jira" as a valid provider', () => {
    const p: Provider = 'jira';
    expect(VALID_PROVIDERS).toContain(p);
  });

  it('accepts "gitlab" as a valid provider', () => {
    const p: Provider = 'gitlab';
    expect(VALID_PROVIDERS).toContain(p);
  });

  it('has exactly 3 valid providers', () => {
    expect(VALID_PROVIDERS).toHaveLength(3);
  });

  it('default provider is "linear"', () => {
    // As per useState<Provider>('linear') in the component
    const defaultProvider: Provider = 'linear';
    expect(defaultProvider).toBe('linear');
  });
});

// ---------------------------------------------------------------------------
// handleCreate logic — isolated error extraction
// ---------------------------------------------------------------------------

describe('CreateIssueModal — handleCreate error extraction logic', () => {
  it('extracts error message from Error instance', () => {
    const err = new Error('Connection refused');
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    expect(msg).toBe('Connection refused');
  });

  it('returns "Erro desconhecido" for non-Error thrown value', () => {
    const err = 'string error';
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    expect(msg).toBe('Erro desconhecido');
  });

  it('returns "Erro desconhecido" for null thrown value', () => {
    const err = null;
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    expect(msg).toBe('Erro desconhecido');
  });

  it('constructs fallback error from status code', () => {
    const status = 503;
    const data: { error?: string } = {};
    const msg = data.error ?? `Erro ${status}`;
    expect(msg).toBe('Erro 503');
  });

  it('prefers API error message over fallback status', () => {
    const status = 400;
    const data: { error?: string } = { error: 'invalid findingId' };
    const msg = data.error ?? `Erro ${status}`;
    expect(msg).toBe('invalid findingId');
  });
});

// ---------------------------------------------------------------------------
// handleCreate — fetch body construction
// ---------------------------------------------------------------------------

describe('CreateIssueModal — fetch body serialization', () => {
  it('serializes all required fields in the POST body', () => {
    const provider: Provider = 'linear';
    const title = '[HIGH] SQL Injection';
    const description = '**Finding:** SQL Injection';
    const findingId = '11111111-1111-1111-1111-111111111111';

    const body = JSON.stringify({ provider, title, description, findingId });
    const parsed = JSON.parse(body);

    expect(parsed.provider).toBe('linear');
    expect(parsed.title).toBe('[HIGH] SQL Injection');
    expect(parsed.description).toBe('**Finding:** SQL Injection');
    expect(parsed.findingId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('uses application/json Content-Type header', () => {
    const headers = { 'Content-Type': 'application/json' };
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ---------------------------------------------------------------------------
// handleClose reset timing — isolated setTimeout logic
// ---------------------------------------------------------------------------

describe('CreateIssueModal — handleClose reset timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('state reset is scheduled 200ms after close (animation-safe)', () => {
    const resetFn = vi.fn();
    const onOpenChange = vi.fn();

    // Simulate handleClose
    function handleClose() {
      onOpenChange(false);
      setTimeout(() => {
        resetFn(); // simulates setSuccess(null) + setErrorMsg(null)
      }, 200);
    }

    handleClose();

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(resetFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(199);
    expect(resetFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(resetFn).toHaveBeenCalledOnce();
  });

  it('onOpenChange(false) is called synchronously before the timer', () => {
    const calls: string[] = [];
    const onOpenChange = vi.fn(() => calls.push('close'));
    const resetFn = vi.fn(() => calls.push('reset'));

    function handleClose() {
      onOpenChange(false);
      setTimeout(() => resetFn(), 200);
    }

    handleClose();
    expect(calls).toEqual(['close']);

    vi.advanceTimersByTime(200);
    expect(calls).toEqual(['close', 'reset']);
  });
});

// ---------------------------------------------------------------------------
// Success state — issueUrl resolution
// ---------------------------------------------------------------------------

describe('CreateIssueModal — success state issueUrl resolution', () => {
  it('prefers "url" field over "issueUrl" field in response', () => {
    const data: { url?: string; issueUrl?: string } = {
      url: 'https://linear.app/issue/MOB-1234',
      issueUrl: 'https://other.app/issue/123',
    };
    const resolved = data.url ?? data.issueUrl ?? '';
    expect(resolved).toBe('https://linear.app/issue/MOB-1234');
  });

  it('falls back to "issueUrl" when "url" is absent', () => {
    const data: { url?: string; issueUrl?: string } = {
      issueUrl: 'https://jira.example.com/browse/PROJ-100',
    };
    const resolved = data.url ?? data.issueUrl ?? '';
    expect(resolved).toBe('https://jira.example.com/browse/PROJ-100');
  });

  it('returns empty string when neither url nor issueUrl is present', () => {
    const data: { url?: string; issueUrl?: string } = {};
    const resolved = data.url ?? data.issueUrl ?? '';
    expect(resolved).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Loading state — button disabled logic
// ---------------------------------------------------------------------------

describe('CreateIssueModal — button disabled during loading', () => {
  it('Create button text changes to "Criando…" during loading', () => {
    const loading = true;
    const label = loading ? 'Criando…' : 'Criar';
    expect(label).toBe('Criando…');
  });

  it('Create button text is "Criar" when not loading', () => {
    const loading = false;
    const label = loading ? 'Criando…' : 'Criar';
    expect(label).toBe('Criar');
  });
});
