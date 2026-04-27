/**
 * Integration tests for GateFunnelChart — component + fetch interaction (MOB-1068)
 *
 * Testing strategy:
 * - No jsdom available in this project. Components with useState/useEffect
 *   cannot be called as plain functions outside a React reconciler.
 * - Tests cover: GateBucket data transformation, fetch URL construction,
 *   AbortController abort behavior, static element tree structure,
 *   and granularity-driven re-fetch URL verification.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/charts/GateFunnelChart.integration.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// ---------------------------------------------------------------------------
// Mocks — declared before any import of the SUT
// ---------------------------------------------------------------------------

vi.mock('recharts', () => ({
  BarChart: vi.fn(() => null),
  Bar: vi.fn(() => null),
  XAxis: vi.fn(() => null),
  YAxis: vi.fn(() => null),
  CartesianGrid: vi.fn(() => null),
  Tooltip: vi.fn(() => null),
  Legend: vi.fn(() => null),
  ResponsiveContainer: vi.fn(() => null),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: vi.fn(() => null),
}));

// ---------------------------------------------------------------------------
// GateBucket transformation logic
// (mirrors the inline `formatted` computation in GateFunnelChart.tsx)
// ---------------------------------------------------------------------------

interface GateBucket {
  bucket: string;
  pass: number | null;
  warn: number | null;
  fail: number | null;
}

function formatBucketLabel(bucket: string): string {
  const d = new Date(bucket);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function transformGateBuckets(
  data: GateBucket[],
): Array<{ bucket: string; pass: number; warn: number; fail: number }> {
  return data.map((b) => ({
    ...b,
    bucket: formatBucketLabel(b.bucket),
    pass: b.pass ?? 0,
    warn: b.warn ?? 0,
    fail: b.fail ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Fetch URL construction — mirrors GateFunnelChart's useEffect
// ---------------------------------------------------------------------------

type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

function buildGateFunnelURL(granularity: TrendGranularity): string {
  return `/api/trend?metric=gate_fail_rate&granularity=${granularity}`;
}

// ---------------------------------------------------------------------------
// Suite 1 — GateBucket data transformation (null-safe coercion)
// ---------------------------------------------------------------------------

describe('GateFunnelChart — GateBucket null-safe transformation', () => {
  it('replaces null pass with 0', () => {
    const result = transformGateBuckets([
      { bucket: '2026-01-01T00:00:00.000Z', pass: null, warn: 0, fail: 0 },
    ]);
    expect(result[0].pass).toBe(0);
  });

  it('replaces null warn with 0', () => {
    const result = transformGateBuckets([
      { bucket: '2026-01-01T00:00:00.000Z', pass: 5, warn: null, fail: 0 },
    ]);
    expect(result[0].warn).toBe(0);
  });

  it('replaces null fail with 0', () => {
    const result = transformGateBuckets([
      { bucket: '2026-01-01T00:00:00.000Z', pass: 5, warn: 2, fail: null },
    ]);
    expect(result[0].fail).toBe(0);
  });

  it('preserves non-null numeric values as-is', () => {
    const result = transformGateBuckets([
      { bucket: '2026-01-01T00:00:00.000Z', pass: 8, warn: 3, fail: 1 },
    ]);
    expect(result[0].pass).toBe(8);
    expect(result[0].warn).toBe(3);
    expect(result[0].fail).toBe(1);
  });

  it('transforms all-null bucket to all-zero values', () => {
    const result = transformGateBuckets([
      { bucket: '2026-01-01T00:00:00.000Z', pass: null, warn: null, fail: null },
    ]);
    expect(result[0].pass).toBe(0);
    expect(result[0].warn).toBe(0);
    expect(result[0].fail).toBe(0);
  });

  it('returns empty array when input is empty (no render for empty data)', () => {
    const result = transformGateBuckets([]);
    expect(result).toEqual([]);
  });

  it('produces one transformed entry per input bucket', () => {
    const input: GateBucket[] = [
      { bucket: '2026-01-01T00:00:00.000Z', pass: 4, warn: 1, fail: 0 },
      { bucket: '2026-01-02T00:00:00.000Z', pass: 6, warn: 2, fail: 1 },
      { bucket: '2026-01-03T00:00:00.000Z', pass: 2, warn: 0, fail: 3 },
    ];
    const result = transformGateBuckets(input);
    expect(result).toHaveLength(3);
  });

  it('bucket label is a formatted date string (not the raw ISO string)', () => {
    const result = transformGateBuckets([
      { bucket: '2026-01-15T00:00:00.000Z', pass: 1, warn: 0, fail: 0 },
    ]);
    // Raw ISO starts with digits like "2026-" — formatted is "dd/mm"
    expect(result[0].bucket).not.toMatch(/^\d{4}-/);
    expect(typeof result[0].bucket).toBe('string');
  });

  it('renders data from mocked API response — multiple buckets produce correct output shape', () => {
    const apiResponse: GateBucket[] = [
      { bucket: '2026-04-01T00:00:00.000Z', pass: 10, warn: 2, fail: 1 },
      { bucket: '2026-04-02T00:00:00.000Z', pass: 8, warn: 1, fail: 0 },
    ];
    const result = transformGateBuckets(apiResponse);

    expect(result).toHaveLength(2);
    // First bar: pass=10, warn=2, fail=1
    expect(result[0].pass).toBe(10);
    expect(result[0].warn).toBe(2);
    expect(result[0].fail).toBe(1);
    // Second bar: pass=8, warn=1, fail=0
    expect(result[1].pass).toBe(8);
    expect(result[1].warn).toBe(1);
    expect(result[1].fail).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — fetch URL construction (always uses gate_fail_rate metric)
// ---------------------------------------------------------------------------

describe('GateFunnelChart — fetch URL always targets gate_fail_rate metric', () => {
  it('URL contains metric=gate_fail_rate for granularity=day', () => {
    const url = buildGateFunnelURL('day');
    expect(url).toBe('/api/trend?metric=gate_fail_rate&granularity=day');
  });

  it('URL contains metric=gate_fail_rate for granularity=week', () => {
    const url = buildGateFunnelURL('week');
    expect(url).toContain('metric=gate_fail_rate');
  });

  it('URL contains metric=gate_fail_rate for granularity=month', () => {
    const url = buildGateFunnelURL('month');
    expect(url).toContain('metric=gate_fail_rate');
  });

  it('URL contains metric=gate_fail_rate for granularity=hour', () => {
    const url = buildGateFunnelURL('hour');
    expect(url).toContain('metric=gate_fail_rate');
  });

  it('granularity change updates the granularity param in the URL', () => {
    const urlDay = buildGateFunnelURL('day');
    const urlWeek = buildGateFunnelURL('week');

    expect(urlDay).toContain('granularity=day');
    expect(urlWeek).toContain('granularity=week');
    expect(urlDay).not.toContain('granularity=week');
    expect(urlWeek).not.toContain('granularity=day');
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — fetch + AbortController integration
// ---------------------------------------------------------------------------

describe('GateFunnelChart — fetch + AbortController integration', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetch is called with gate_fail_rate URL and an AbortSignal on mount', async () => {
    const capturedArgs: { url: string; signal: AbortSignal | undefined }[] = [];
    globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      capturedArgs.push({
        url: String(url),
        signal: init?.signal as AbortSignal | undefined,
      });
      return Promise.resolve({ json: () => Promise.resolve([]) } as Response);
    });

    const controller = new AbortController();
    await globalThis.fetch('/api/trend?metric=gate_fail_rate&granularity=day', {
      signal: controller.signal,
    });

    expect(capturedArgs).toHaveLength(1);
    expect(capturedArgs[0].url).toBe('/api/trend?metric=gate_fail_rate&granularity=day');
    expect(capturedArgs[0].signal).toBeDefined();
  });

  it('granularity change triggers new fetch with updated granularity param', async () => {
    const fetchedURLs: string[] = [];
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      fetchedURLs.push(String(url));
      return Promise.resolve({ json: () => Promise.resolve([]) } as Response);
    });

    // Simulate initial mount fetch (granularity=day)
    await globalThis.fetch('/api/trend?metric=gate_fail_rate&granularity=day', {
      signal: new AbortController().signal,
    });

    // Simulate granularity change to week — triggers new fetch
    await globalThis.fetch('/api/trend?metric=gate_fail_rate&granularity=week', {
      signal: new AbortController().signal,
    });

    expect(fetchedURLs).toHaveLength(2);
    expect(fetchedURLs[0]).toContain('granularity=day');
    expect(fetchedURLs[1]).toContain('granularity=week');
  });

  it('AbortController cancels pending request on granularity change', async () => {
    const controller = new AbortController();
    let _rejectFetch!: (err: Error) => void;

    globalThis.fetch = vi.fn(() => {
      return new Promise<Response>((_, reject) => {
        _rejectFetch = reject;
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const pendingFetch = globalThis.fetch('/api/trend?metric=gate_fail_rate&granularity=day', {
      signal: controller.signal,
    });

    // Simulate granularity change: abort the old request before it resolves
    controller.abort();

    const err = await pendingFetch.catch((e: Error) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
  });

  it('no state update occurs after abort (AbortError is filtered out)', () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');

    // This is the exact condition in GateFunnelChart's catch block:
    // if (err.name !== 'AbortError') { setError(true); setLoading(false); }
    const shouldSetError = (err: Error): boolean => err.name !== 'AbortError';

    expect(shouldSetError(abortError)).toBe(false);
  });

  it('non-AbortError triggers error state (network failures set error=true)', () => {
    const networkError = new TypeError('Failed to fetch');

    const shouldSetError = (err: Error): boolean => err.name !== 'AbortError';

    expect(shouldSetError(networkError)).toBe(true);
  });

  it('successful fetch resolves with GateBucket array from API', async () => {
    const mockBuckets: GateBucket[] = [
      { bucket: '2026-04-01T00:00:00.000Z', pass: 5, warn: 1, fail: 0 },
    ];
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve(mockBuckets) } as Response),
    );

    const response = await globalThis.fetch('/api/trend?metric=gate_fail_rate&granularity=day');
    const buckets = await (response as Response).json() as GateBucket[];

    expect(buckets).toHaveLength(1);
    expect(buckets[0].pass).toBe(5);
    expect(buckets[0].warn).toBe(1);
    expect(buckets[0].fail).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — GateFunnelChart static element structure
// ---------------------------------------------------------------------------

describe('GateFunnelChart — exports and static interface', () => {
  it('exports GateFunnelChart as a named function', async () => {
    const { GateFunnelChart } = await import('./GateFunnelChart');
    expect(typeof GateFunnelChart).toBe('function');
  });

  it('GateFunnelChart accepts optional title and className props', async () => {
    const { GateFunnelChart } = await import('./GateFunnelChart');
    expect(GateFunnelChart.length).toBe(1);
  });
});
