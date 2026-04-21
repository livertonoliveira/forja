import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { detectNPlusOne } from '../heuristics/n-plus-one.js';
import { detectMissingCache } from '../heuristics/missing-cache.js';
import { detectPessimisticLocks } from '../heuristics/pessimistic-locks.js';

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
