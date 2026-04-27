/**
 * Unit tests for src/otel/tracer.ts — MOB-1089.
 *
 * Tests:
 *  - withSpan() calls fn with a span object
 *  - withSpan() resolves with the value returned by fn
 *  - withSpan() propagates rejection when fn throws
 *  - The span passed to fn has setAttribute, end, setStatus, recordException methods
 *  - withSpan() works with empty attributes {}
 *  - withSpan() works with multiple attributes
 */

import { describe, it, expect } from 'vitest';
import { withSpan, tracer } from '../tracer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasSpanShape(span: unknown): boolean {
  if (typeof span !== 'object' || span === null) return false;
  const s = span as Record<string, unknown>;
  return (
    typeof s['setAttribute'] === 'function' &&
    typeof s['end'] === 'function' &&
    typeof s['setStatus'] === 'function' &&
    typeof s['recordException'] === 'function'
  );
}

// ---------------------------------------------------------------------------
// tracer export
// ---------------------------------------------------------------------------

describe('tracer — export', () => {
  it('exports a tracer object', () => {
    expect(tracer).toBeDefined();
    expect(typeof tracer.startActiveSpan).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// withSpan — fn invocation and return value
// ---------------------------------------------------------------------------

describe('withSpan — fn invocation', () => {
  it('calls fn with a span object', async () => {
    let receivedSpan: unknown = undefined;

    await withSpan('test-span', {}, async (span) => {
      receivedSpan = span;
    });

    expect(receivedSpan).toBeDefined();
  });

  it('resolves with the value returned by fn', async () => {
    const result = await withSpan('test-span', {}, async (_span) => {
      return 42;
    });

    expect(result).toBe(42);
  });

  it('resolves with a string value returned by fn', async () => {
    const result = await withSpan('test-span', {}, async (_span) => {
      return 'hello';
    });

    expect(result).toBe('hello');
  });

  it('resolves with an object value returned by fn', async () => {
    const payload = { id: 1, name: 'forja' };

    const result = await withSpan('test-span', {}, async (_span) => {
      return payload;
    });

    expect(result).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// withSpan — span duck-type shape
// ---------------------------------------------------------------------------

describe('withSpan — span shape', () => {
  it('passes a span with setAttribute, end, setStatus, recordException methods', async () => {
    let receivedSpan: unknown = undefined;

    await withSpan('shape-check', { 'test.attr': 'value' }, async (span) => {
      receivedSpan = span;
    });

    expect(hasSpanShape(receivedSpan)).toBe(true);
  });

  it('works with empty attributes {}', async () => {
    await expect(
      withSpan('empty-attrs', {}, async (_span) => 'ok'),
    ).resolves.toBe('ok');
  });

  it('works with multiple attributes', async () => {
    await expect(
      withSpan(
        'multi-attrs',
        { 'http.method': 'GET', 'http.status_code': 200, 'db.system': 'mongodb' },
        async (_span) => true,
      ),
    ).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// withSpan — error propagation
// ---------------------------------------------------------------------------

describe('withSpan — error propagation', () => {
  it('propagates rejection when fn throws an Error', async () => {
    const error = new Error('something went wrong');

    await expect(
      withSpan('error-span', {}, async (_span) => {
        throw error;
      }),
    ).rejects.toThrow('something went wrong');
  });

  it('propagates rejection when fn throws a non-Error value', async () => {
    await expect(
      withSpan('error-string-span', {}, async (_span) => {
        throw 'raw string error';
      }),
    ).rejects.toThrow();
  });

  it('does not resolve after fn throws', async () => {
    let resolved = false;

    await withSpan('track-span', {}, async (_span) => 'done')
      .then(() => {
        resolved = true;
      });

    expect(resolved).toBe(true);

    let rejected = false;
    await withSpan('track-error-span', {}, async (_span) => {
      throw new Error('fail');
    }).catch(() => {
      rejected = true;
    });

    expect(rejected).toBe(true);
  });
});
