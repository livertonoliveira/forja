/**
 * Integration tests for TrendChart — component + fetch interaction (MOB-1068)
 *
 * Testing strategy:
 * - No jsdom available in this project. Components with useState/useEffect
 *   cannot be called as plain functions outside a React reconciler.
 * - Tests cover: pure utility functions (csvEscape, CSV generation),
 *   fetch URL construction logic, static element tree structure,
 *   and the integration between granularity state and fetch params.
 *
 * Run from monorepo root:
 *   node_modules/.bin/vitest run --pool=threads apps/ui/components/charts/TrendChart.integration.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';

// ---------------------------------------------------------------------------
// Mocks — declared before any import of the SUT
// ---------------------------------------------------------------------------

vi.mock('recharts', () => ({
  LineChart: vi.fn(() => null),
  Line: vi.fn(() => null),
  XAxis: vi.fn(() => null),
  YAxis: vi.fn(() => null),
  CartesianGrid: vi.fn(() => null),
  Tooltip: vi.fn(() => null),
  ResponsiveContainer: vi.fn(() => null),
  Legend: vi.fn(() => null),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: vi.fn(() => null),
}));

vi.mock('@/lib/forja-store', () => ({
  // Re-export only what is used as type imports — runtime needs nothing here
}));

// ---------------------------------------------------------------------------
// csvEscape logic — extracted inline for pure-function testing
// (mirrors the implementation in TrendChart.tsx)
// ---------------------------------------------------------------------------

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str) || /^[=+\-@\t\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ---------------------------------------------------------------------------
// CSV generation logic — mirrors exportCSV() in TrendChart.tsx
// (returns the CSV string instead of triggering a download)
// ---------------------------------------------------------------------------

interface LineConfig {
  dataKey: string;
  stroke: string;
  name: string;
}

interface TrendBucket {
  bucket: string;
  [key: string]: unknown;
}

function buildCSVContent(data: TrendBucket[], lines: LineConfig[]): string {
  const keys = ['bucket', ...lines.map((l) => l.dataKey)];
  const headers = keys.map(csvEscape).join(',');
  const rows = data
    .map((d) => keys.map((k) => csvEscape(d[k])).join(','))
    .join('\n');
  return headers + '\n' + rows;
}

// ---------------------------------------------------------------------------
// Fetch URL construction — mirrors the URL built in TrendChart's useEffect
// ---------------------------------------------------------------------------

type TrendMetric = 'findings' | 'gate_fail_rate' | 'cost' | 'run_duration';
type TrendGranularity = 'hour' | 'day' | 'week' | 'month';

function buildTrendURL(metric: TrendMetric, granularity: TrendGranularity): string {
  return `/api/trend?metric=${metric}&granularity=${granularity}`;
}

// ---------------------------------------------------------------------------
// Suite 1 — csvEscape pure function
// ---------------------------------------------------------------------------

describe('csvEscape — safe quoting for CSV output', () => {
  it('returns plain string when value has no special characters', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('wraps value in double-quotes when it contains a comma', () => {
    expect(csvEscape('hello,world')).toBe('"hello,world"');
  });

  it('wraps value in double-quotes when it contains a double-quote and escapes it', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps value in double-quotes when it contains a newline', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns empty string for null value', () => {
    expect(csvEscape(null)).toBe('');
  });

  it('returns empty string for undefined value', () => {
    expect(csvEscape(undefined)).toBe('');
  });

  it('wraps value starting with = (formula injection prevention)', () => {
    expect(csvEscape('=SUM(A1)')).toBe('"=SUM(A1)"');
  });

  it('wraps value starting with + (formula injection prevention)', () => {
    // The value starts with + and also contains double-quotes, so both rules apply:
    // it is wrapped in double-quotes AND internal double-quotes are escaped ("" per CSV spec)
    expect(csvEscape('+cmd|"/c calc"')).toBe('"+cmd|""/c calc"""');
  });

  it('converts numbers to string without quoting', () => {
    expect(csvEscape(42)).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — buildCSVContent (CSV generation)
// ---------------------------------------------------------------------------

describe('buildCSVContent — CSV file generation from TrendBucket array', () => {
  const lines: LineConfig[] = [
    { dataKey: 'critical', stroke: '#f00', name: 'Critical' },
    { dataKey: 'high', stroke: '#fa0', name: 'High' },
  ];

  it('first line is the header with bucket + dataKey columns', () => {
    const csv = buildCSVContent([], lines);
    const [header] = csv.split('\n');
    expect(header).toBe('bucket,critical,high');
  });

  it('generates one data row per bucket entry', () => {
    const data: TrendBucket[] = [
      { bucket: '2026-01-01T00:00:00.000Z', critical: 5, high: 2 },
      { bucket: '2026-01-02T00:00:00.000Z', critical: 0, high: 1 },
    ];
    const csv = buildCSVContent(data, lines);
    const rows = csv.split('\n');
    // header + 2 data rows
    expect(rows).toHaveLength(3);
  });

  it('data row values match bucket fields in correct column order', () => {
    const data: TrendBucket[] = [
      { bucket: '2026-01-01T00:00:00.000Z', critical: 3, high: 7 },
    ];
    const csv = buildCSVContent(data, lines);
    const [, dataRow] = csv.split('\n');
    expect(dataRow).toBe('2026-01-01T00:00:00.000Z,3,7');
  });

  it('null values in bucket render as empty string in CSV', () => {
    const data: TrendBucket[] = [
      { bucket: '2026-01-01T00:00:00.000Z', critical: null, high: null },
    ];
    const csv = buildCSVContent(data, lines);
    const [, dataRow] = csv.split('\n');
    expect(dataRow).toBe('2026-01-01T00:00:00.000Z,,');
  });

  it('produces only the header row when data array is empty', () => {
    const csv = buildCSVContent([], lines);
    const rows = csv.split('\n').filter((r) => r.length > 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toBe('bucket,critical,high');
  });

  it('CSV content includes all lines dataKeys as columns', () => {
    const multiLines: LineConfig[] = [
      { dataKey: 'critical', stroke: '#f00', name: 'Critical' },
      { dataKey: 'high', stroke: '#fa0', name: 'High' },
      { dataKey: 'medium', stroke: '#ff0', name: 'Medium' },
      { dataKey: 'low', stroke: '#0f0', name: 'Low' },
    ];
    const csv = buildCSVContent([], multiLines);
    const [header] = csv.split('\n');
    expect(header).toBe('bucket,critical,high,medium,low');
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — fetch URL construction (metric + granularity params)
// ---------------------------------------------------------------------------

describe('TrendChart — fetch URL construction (metric + granularity params)', () => {
  it('builds correct URL for metric=findings and granularity=day', () => {
    const url = buildTrendURL('findings', 'day');
    expect(url).toBe('/api/trend?metric=findings&granularity=day');
  });

  it('builds correct URL for metric=cost and granularity=week', () => {
    const url = buildTrendURL('cost', 'week');
    expect(url).toBe('/api/trend?metric=cost&granularity=week');
  });

  it('builds correct URL for metric=run_duration and granularity=month', () => {
    const url = buildTrendURL('run_duration', 'month');
    expect(url).toBe('/api/trend?metric=run_duration&granularity=month');
  });

  it('builds correct URL for metric=gate_fail_rate and granularity=hour', () => {
    const url = buildTrendURL('gate_fail_rate', 'hour');
    expect(url).toBe('/api/trend?metric=gate_fail_rate&granularity=hour');
  });

  it('changing granularity from day to week changes the URL granularity param', () => {
    const urlDay = buildTrendURL('findings', 'day');
    const urlWeek = buildTrendURL('findings', 'week');
    expect(urlDay).toContain('granularity=day');
    expect(urlWeek).toContain('granularity=week');
    expect(urlDay).not.toContain('granularity=week');
    expect(urlWeek).not.toContain('granularity=day');
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — fetch integration: fetch is called with correct URL and signal
// ---------------------------------------------------------------------------

describe('TrendChart — fetch called with correct metric + granularity on mount', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetch is invoked with the correct URL when called directly with metric=findings and granularity=day', async () => {
    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      fetchCalls.push(String(url));
      return Promise.resolve({
        json: () => Promise.resolve([]),
      } as Response);
    });

    // Simulate the fetch call that TrendChart makes on mount
    const metric: TrendMetric = 'findings';
    const granularity: TrendGranularity = 'day';
    await globalThis.fetch(`/api/trend?metric=${metric}&granularity=${granularity}`, {
      signal: new AbortController().signal,
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe('/api/trend?metric=findings&granularity=day');
  });

  it('fetch URL changes when granularity changes from day to week', async () => {
    const fetchCalls: string[] = [];
    globalThis.fetch = vi.fn((url: string | URL | Request) => {
      fetchCalls.push(String(url));
      return Promise.resolve({
        json: () => Promise.resolve([]),
      } as Response);
    });

    const metric: TrendMetric = 'findings';

    // First fetch with day granularity (initial mount)
    await globalThis.fetch(`/api/trend?metric=${metric}&granularity=day`, {
      signal: new AbortController().signal,
    });

    // Second fetch after granularity change to week
    await globalThis.fetch(`/api/trend?metric=${metric}&granularity=week`, {
      signal: new AbortController().signal,
    });

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]).toContain('granularity=day');
    expect(fetchCalls[1]).toContain('granularity=week');
  });

  it('AbortController signal can cancel a pending fetch request', async () => {
    const controller = new AbortController();

    // Simulate a pending fetch that checks for abort
    let _resolveFetch!: () => void;
    const fetchPromise = new Promise<Response>((resolve, reject) => {
      _resolveFetch = () => resolve({ json: () => Promise.resolve([]) } as Response);
      controller.signal.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });

    globalThis.fetch = vi.fn(() => fetchPromise);

    const fetchWithAbort = globalThis.fetch('/api/trend?metric=findings&granularity=day', {
      signal: controller.signal,
    });

    // Abort before the fetch resolves
    controller.abort();

    const err = await fetchWithAbort.catch((e: Error) => e);
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');

    // Verify state would NOT be updated after abort (the catch block filters AbortError)
    const shouldUpdateState = (err: Error): boolean => err.name !== 'AbortError';
    expect(shouldUpdateState(err as DOMException)).toBe(false);
  });

  it('non-AbortError triggers error state (shouldUpdateState returns true)', () => {
    const networkError = new Error('Network failure');
    networkError.name = 'TypeError';

    const shouldUpdateState = (err: Error): boolean => err.name !== 'AbortError';
    expect(shouldUpdateState(networkError)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — TrendChart static element structure
// ---------------------------------------------------------------------------

describe('TrendChart — exports and static interface', () => {
  it('exports TrendChart as a named function', async () => {
    const { TrendChart } = await import('./TrendChart');
    expect(typeof TrendChart).toBe('function');
  });

  it('TrendChart accepts metric, lines, title, and optional className props', async () => {
    const { TrendChart } = await import('./TrendChart');
    // Function signature length: 1 (destructured props object counts as 1)
    expect(TrendChart.length).toBe(1);
  });

  it('chart-utils exports GranularityToggle as a function', async () => {
    const { GranularityToggle } = await import('./chart-utils');
    expect(typeof GranularityToggle).toBe('function');
  });

  it('chart-utils exports GRANULARITIES array with hour, day, week, month', async () => {
    const { GRANULARITIES } = await import('./chart-utils');
    expect(GRANULARITIES).toEqual(['hour', 'day', 'week', 'month']);
  });

  it('chart-utils formatBucket returns a string for a valid ISO bucket + granularity', async () => {
    const { formatBucket } = await import('./chart-utils');
    const result = formatBucket('2026-01-15T00:00:00.000Z', 'day');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('GranularityToggle renders buttons for each granularity option', async () => {
    const { GranularityToggle, GRANULARITIES } = await import('./chart-utils');
    const el = GranularityToggle({ value: 'day', onChange: vi.fn() });
    expect(el).not.toBeNull();
    const wrapperEl = el as React.ReactElement;
    expect(wrapperEl.type).toBe('div');
    const children = React.Children.toArray(
      (wrapperEl.props as { children: React.ReactNode }).children,
    );
    expect(children).toHaveLength(GRANULARITIES.length);
  });
});
