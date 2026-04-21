import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { detectUseClientLeakage } from '../heuristics/use-client-leakage.js';
import { detectMissingCacheConfig } from '../heuristics/missing-cache-config.js';
import { detectRevalidationAntiPattern } from '../heuristics/revalidation-anti-pattern.js';
import { detectMiddlewareBundleSize } from '../heuristics/middleware-bundle-size.js';
import { detectStaticPrerenderingGaps } from '../heuristics/static-prerendering-gaps.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../../../tests/fixtures/audits/frontend/nextjs');

function makeCtx(cwd: string) {
  return {
    cwd,
    stack: { language: 'typescript', runtime: 'node', framework: 'Next.js' },
    config: {},
    abortSignal: new AbortController().signal,
  };
}

describe('detectUseClientLeakage', () => {
  it('flags component with "use client" and no interactivity', async () => {
    const findings = await detectUseClientLeakage(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('use-client-leakage-positive'))).toBe(true);
  });

  it('does not flag component with "use client" and event handlers', async () => {
    const findings = await detectUseClientLeakage(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('use-client-leakage-negative'))).toBe(false);
  });

  it('produces medium severity', async () => {
    const findings = await detectUseClientLeakage(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectUseClientLeakage(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.category).toBe('performance:use-client-leakage'));
  });
});

describe('detectMissingCacheConfig', () => {
  it('flags route handler without cache config', async () => {
    const findings = await detectMissingCacheConfig(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('missing-cache-config-positive'))).toBe(true);
  });

  it('does not flag route handler with explicit revalidate', async () => {
    const findings = await detectMissingCacheConfig(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('missing-cache-config-negative'))).toBe(false);
  });

  it('produces medium severity', async () => {
    const findings = await detectMissingCacheConfig(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectMissingCacheConfig(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.category).toBe('performance:missing-cache-config'));
  });
});

describe('detectRevalidationAntiPattern', () => {
  it('flags revalidate = 0', async () => {
    const findings = await detectRevalidationAntiPattern(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('revalidation-anti-pattern-positive'))).toBe(true);
  });

  it('does not flag revalidate = 3600', async () => {
    const findings = await detectRevalidationAntiPattern(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('revalidation-anti-pattern-negative'))).toBe(false);
  });

  it('produces medium severity', async () => {
    const findings = await detectRevalidationAntiPattern(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectRevalidationAntiPattern(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.category).toBe('performance:revalidation-anti-pattern'));
  });
});

describe('detectMiddlewareBundleSize', () => {
  it('flags middleware importing heavy libraries', async () => {
    const findings = await detectMiddlewareBundleSize(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('middleware-bundle-size-positive'))).toBe(true);
  });

  it('does not flag middleware with only lightweight imports', async () => {
    const findings = await detectMiddlewareBundleSize(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('middleware-bundle-size-negative'))).toBe(false);
  });

  it('produces high severity', async () => {
    const findings = await detectMiddlewareBundleSize(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectMiddlewareBundleSize(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.category).toBe('performance:middleware-bundle-size'));
  });
});

describe('detectStaticPrerenderingGaps', () => {
  it('flags data fetch without cache configuration', async () => {
    const findings = await detectStaticPrerenderingGaps(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('static-prerendering-gaps-positive'))).toBe(true);
  });

  it('does not flag data fetch with explicit revalidate', async () => {
    const findings = await detectStaticPrerenderingGaps(makeCtx(FIXTURES_DIR));
    expect(findings.some((f) => f.filePath?.includes('static-prerendering-gaps-negative'))).toBe(false);
  });

  it('produces medium severity', async () => {
    const findings = await detectStaticPrerenderingGaps(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectStaticPrerenderingGaps(makeCtx(FIXTURES_DIR));
    findings.forEach((f) => expect(f.category).toBe('performance:static-prerendering-gaps'));
  });
});
