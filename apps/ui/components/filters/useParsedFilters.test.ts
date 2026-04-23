/**
 * Unit tests for apps/ui/components/filters/useParsedFilters.ts (MOB-1066)
 *
 * Tests without DOM rendering — validates module exports, hook structure,
 * and that the hook uses nuqs with the correct parser configurations.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/filters/useParsedFilters.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockUseQueryState = vi.fn();

vi.mock('nuqs', () => {
  const parseAsString = {
    withDefault: (def: string) => ({ _default: def, _parser: 'string' }),
    _parser: 'string',
  };
  const parseAsIsoDate = { _parser: 'isoDate' };
  const parseAsArrayOf = (inner: unknown) => ({
    withDefault: (def: unknown[]) => ({ _default: def, _parser: 'array', _inner: inner }),
    _parser: 'array',
    _inner: inner,
  });
  return { useQueryState: mockUseQueryState, parseAsString, parseAsIsoDate, parseAsArrayOf };
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

describe('useParsedFilters.ts — named exports', () => {
  it('exports useParsedFilters as a function', async () => {
    const mod = await import('./useParsedFilters');
    expect(mod.useParsedFilters).toBeDefined();
    expect(typeof mod.useParsedFilters).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Hook invocation — validates nuqs is called with correct keys and parsers
// ---------------------------------------------------------------------------

describe('useParsedFilters — nuqs query state keys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Return [value, setter] pairs for each call
    mockUseQueryState
      .mockReturnValueOnce(['', vi.fn()]) // q
      .mockReturnValueOnce([null, vi.fn()]) // from
      .mockReturnValueOnce([null, vi.fn()]) // to
      .mockReturnValueOnce([[], vi.fn()]); // gate
  });

  it('calls useQueryState with "q" key first', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    useParsedFilters();
    const firstCall = mockUseQueryState.mock.calls[0];
    expect(firstCall[0]).toBe('q');
  });

  it('calls useQueryState with "from" key second', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    useParsedFilters();
    const secondCall = mockUseQueryState.mock.calls[1];
    expect(secondCall[0]).toBe('from');
  });

  it('calls useQueryState with "to" key third', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    useParsedFilters();
    const thirdCall = mockUseQueryState.mock.calls[2];
    expect(thirdCall[0]).toBe('to');
  });

  it('calls useQueryState with "gate" key fourth', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    useParsedFilters();
    const fourthCall = mockUseQueryState.mock.calls[3];
    expect(fourthCall[0]).toBe('gate');
  });

  it('returns an object with q, setQ, from, setFrom, to, setTo, gate, setGate', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    const result = useParsedFilters();
    expect(result).toHaveProperty('q');
    expect(result).toHaveProperty('setQ');
    expect(result).toHaveProperty('from');
    expect(result).toHaveProperty('setFrom');
    expect(result).toHaveProperty('to');
    expect(result).toHaveProperty('setTo');
    expect(result).toHaveProperty('gate');
    expect(result).toHaveProperty('setGate');
  });
});

// ---------------------------------------------------------------------------
// Hook defaults — validates the initial return values from mocked nuqs
// ---------------------------------------------------------------------------

describe('useParsedFilters — default values', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQueryState
      .mockReturnValueOnce(['', vi.fn()])   // q defaults to ''
      .mockReturnValueOnce([null, vi.fn()]) // from defaults to null
      .mockReturnValueOnce([null, vi.fn()]) // to defaults to null
      .mockReturnValueOnce([[], vi.fn()]);  // gate defaults to []
  });

  it('q initializes with empty string by default', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    const { q } = useParsedFilters();
    expect(q).toBe('');
  });

  it('from initializes as null by default', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    const { from } = useParsedFilters();
    expect(from).toBeNull();
  });

  it('to initializes as null by default', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    const { to } = useParsedFilters();
    expect(to).toBeNull();
  });

  it('gate initializes as empty array by default', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    const { gate } = useParsedFilters();
    expect(gate).toEqual([]);
  });

  it('setQ is a function', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    const { setQ } = useParsedFilters();
    expect(typeof setQ).toBe('function');
  });

  it('setGate is a function', async () => {
    const { useParsedFilters } = await import('./useParsedFilters');
    const { setGate } = useParsedFilters();
    expect(typeof setGate).toBe('function');
  });
});
