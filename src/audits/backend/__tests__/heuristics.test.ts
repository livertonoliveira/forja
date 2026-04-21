import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { detectNPlusOne } from '../heuristics/n-plus-one.js';
import { detectMissingCache } from '../heuristics/missing-cache.js';
import { detectPessimisticLocks } from '../heuristics/pessimistic-locks.js';
import { detectBlockingIO } from '../heuristics/blocking-io.js';
import { detectMemoryGrowth } from '../heuristics/memory-growth.js';
import { detectSecretLeaks } from '../heuristics/secret-leaks.js';
import { detectMissingRequestTimeout } from '../heuristics/request-timeout.js';

// The test file lives at src/audits/backend/__tests__/heuristics.test.ts
// Going up 4 levels (____tests__ → backend → audits → src → project root)
// then into tests/fixtures/audits/backend
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../../tests/fixtures/audits/backend');

function makeCtx(cwd: string) {
  return {
    cwd,
    stack: { language: 'typescript', runtime: 'node', framework: 'NestJS' },
    config: {},
    abortSignal: new AbortController().signal,
  };
}

describe('detectNPlusOne', () => {
  it('detects N+1 in positive fixture', async () => {
    const findings = await detectNPlusOne(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('n-plus-one-positive'));
    expect(found).toBe(true);
  });

  it('does not flag n-plus-one-negative fixture', async () => {
    const findings = await detectNPlusOne(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('n-plus-one-negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectNPlusOne(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectNPlusOne(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('performance:n-plus-one'));
  });
});

describe('detectMissingCache', () => {
  it('detects missing cache in positive fixture', async () => {
    const findings = await detectMissingCache(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('missing-cache-positive'));
    expect(found).toBe(true);
  });

  it('does not flag missing-cache-negative fixture', async () => {
    const findings = await detectMissingCache(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('missing-cache-negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces low severity findings', async () => {
    const findings = await detectMissingCache(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('low'));
  });
});

describe('detectPessimisticLocks', () => {
  it('detects FOR UPDATE in positive fixture', async () => {
    const findings = await detectPessimisticLocks(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('pessimistic-locks-positive'));
    expect(found).toBe(true);
  });

  it('does not flag pessimistic-locks-negative fixture', async () => {
    const findings = await detectPessimisticLocks(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('pessimistic-locks-negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectPessimisticLocks(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });
});

describe('detectBlockingIO', () => {
  it('detects sync I/O in positive fixture', async () => {
    const findings = await detectBlockingIO(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('blocking-io-positive'))).toBe(true);
  });

  it('does not flag blocking-io-negative fixture', async () => {
    const findings = await detectBlockingIO(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('blocking-io-negative'))).toBe(false);
  });

  it('does not flag module-level readFileSync (no async context)', async () => {
    const findings = await detectBlockingIO(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('blocking-io-module-level'))).toBe(false);
  });

  it('produces medium severity', async () => {
    const findings = await detectBlockingIO(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectBlockingIO(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('performance:blocking-io'));
  });
});

describe('detectMemoryGrowth', () => {
  it('detects unbounded Map in positive fixture', async () => {
    const findings = await detectMemoryGrowth(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('memory-growth-positive'))).toBe(true);
  });

  it('does not flag memory-growth-negative fixture', async () => {
    const findings = await detectMemoryGrowth(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('memory-growth-negative'))).toBe(false);
  });

  it('produces medium severity', async () => {
    const findings = await detectMemoryGrowth(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });
});

describe('detectSecretLeaks', () => {
  it('detects secret in log in positive fixture', async () => {
    const findings = await detectSecretLeaks(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('secret-leaks-positive'))).toBe(true);
  });

  it('does not flag secret-leaks-negative fixture', async () => {
    const findings = await detectSecretLeaks(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('secret-leaks-negative'))).toBe(false);
  });

  it('produces high severity', async () => {
    const findings = await detectSecretLeaks(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectSecretLeaks(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('security:secret-leaks'));
  });
});

describe('detectMissingRequestTimeout', () => {
  it('detects missing timeout in positive fixture', async () => {
    const findings = await detectMissingRequestTimeout(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('request-timeout-positive'))).toBe(true);
  });

  it('does not flag request-timeout-negative fixture', async () => {
    const findings = await detectMissingRequestTimeout(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('request-timeout-negative'))).toBe(false);
  });

  it('produces medium severity', async () => {
    const findings = await detectMissingRequestTimeout(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectMissingRequestTimeout(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('performance:missing-request-timeout'));
  });
});
