import { describe, it, expect } from 'vitest';
import { redact, redactObject } from '../../src/hooks/redaction.js';

describe('redact — API key pattern (sk- prefix)', () => {
  it('redacts an OpenAI/Anthropic-style sk- key', () => {
    const input = 'Using key sk-abcdefghijklmnopqrstuvwxyz123456';
    const result = redact(input);
    expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(result).toContain('[REDACTED]');
  });

  it('does not redact sk- prefix that is too short', () => {
    const input = 'short sk-abc123';
    const result = redact(input);
    expect(result).toBe(input);
  });
});

describe('redact — GitHub token pattern (ghp_ prefix)', () => {
  it('redacts a GitHub personal access token', () => {
    const token = 'ghp_' + 'A'.repeat(36);
    const input = `token=${token}`;
    const result = redact(input);
    expect(result).not.toContain(token);
    expect(result).toContain('[REDACTED]');
  });
});

describe('redact — keyword=value pattern', () => {
  it('redacts password=<value>', () => {
    const input = 'password=supersecret123';
    const result = redact(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('supersecret123');
  });

  it('redacts secret: <value>', () => {
    const input = 'secret: myApiToken99';
    expect(redact(input)).toContain('[REDACTED]');
  });

  it('does not redact short values under 8 chars', () => {
    const input = 'key=short';
    expect(redact(input)).toBe(input);
  });
});

describe('redact — Bearer/Authorization pattern', () => {
  it('redacts Bearer token', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const input = `Authorization: Bearer ${token}`;
    const result = redact(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain(token);
  });

  it('does not redact short bearer-like text under 20 chars', () => {
    const input = 'bearer shorttok';
    expect(redact(input)).toBe(input);
  });
});

describe('redact — normal text', () => {
  it('does not redact normal English sentences', () => {
    const input = 'The quick brown fox jumps over the lazy dog.';
    expect(redact(input)).toBe(input);
  });

  it('does not redact short identifiers and code', () => {
    const input = 'const x = someFunction(a, b);';
    expect(redact(input)).toBe(input);
  });
});

describe('redact — high-entropy detection', () => {
  it('does not redact a short base64-like hash below threshold', () => {
    const input = 'abc123defABC456';
    expect(redact(input)).toBe(input);
  });

  it('redacts a high-entropy long base64 string resembling a real token', () => {
    const highEntropyToken = 'aB3dEfGhIjKlMnOpQrStUvWxYz012345aB3dEfGhIjKlMnOpQrStUvWxYz01234';
    const result = redact(highEntropyToken);
    expect(result).toContain('[REDACTED]');
  });

  it('does not redact a low-entropy long string', () => {
    const lowEntropyString = 'a'.repeat(40);
    expect(redact(lowEntropyString)).toBe(lowEntropyString);
  });

  it('skips entropy scan on strings longer than 4096 chars', () => {
    const highEntropyToken = 'aB3dEfGhIjKlMnOpQrStUvWxYz012345';
    const largeText = highEntropyToken.repeat(200);
    // Should not be redacted because entropy scan is skipped
    const result = redact(largeText);
    expect(result).not.toContain('[REDACTED]');
  });
});

describe('redactObject — deep-redact nested object', () => {
  it('redacts API key in nested object while preserving structure', () => {
    const apiKey = 'sk-' + 'x'.repeat(32);
    const obj = {
      config: {
        apiKey,
        model: 'claude-sonnet',
      },
      count: 42,
    };
    const result = redactObject(obj) as typeof obj;
    expect(result.config.apiKey).toContain('[REDACTED]');
    expect(result.config.model).toBe('claude-sonnet');
    expect(result.count).toBe(42);
  });

  it('handles circular references without crashing', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => redactObject(a)).not.toThrow();
    const result = redactObject(a) as Record<string, unknown>;
    expect(result.self).toBe('[Circular]');
  });
});

describe('redactObject — array of strings', () => {
  it('redacts matching strings in an array', () => {
    const token = 'ghp_' + 'B'.repeat(36);
    const arr = ['normal string', token, 'another normal'];
    const result = redactObject(arr) as string[];
    expect(result[0]).toBe('normal string');
    expect(result[1]).toContain('[REDACTED]');
    expect(result[2]).toBe('another normal');
  });
});

describe('redactObject — non-string primitives', () => {
  it('leaves numbers unchanged', () => {
    expect(redactObject(42)).toBe(42);
  });

  it('leaves booleans unchanged', () => {
    expect(redactObject(true)).toBe(true);
  });

  it('leaves null unchanged', () => {
    expect(redactObject(null)).toBe(null);
  });

  it('leaves undefined unchanged', () => {
    expect(redactObject(undefined)).toBe(undefined);
  });

  it('leaves object with only numbers unchanged', () => {
    const obj = { a: 1, b: 2 };
    expect(redactObject(obj)).toEqual(obj);
  });
});
