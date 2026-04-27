import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { frontendAuditModule } from '../../../src/audits/frontend/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../tests/fixtures/audits/frontend');
const NEXTJS_FIXTURES_DIR = join(FIXTURES_DIR, 'nextjs');
const GENERIC_FIXTURES_DIR = join(FIXTURES_DIR, 'generic');

function makeCtx(cwd: string, framework: string) {
  return {
    cwd,
    stack: { language: 'typescript', runtime: 'node', framework },
    config: {},
    abortSignal: new AbortController().signal,
  };
}

describe('frontend audit golden test', () => {
  it('Next.js: detects ≥5 baseline findings (zero regressions)', async () => {
    const ctx = makeCtx(NEXTJS_FIXTURES_DIR, 'nextjs');
    const findings = await frontendAuditModule.run(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(5);
  });

  it('Generic: detects findings from positive fixtures', async () => {
    const ctx = makeCtx(GENERIC_FIXTURES_DIR, 'vite');
    const findings = await frontendAuditModule.run(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    const categories = new Set(findings.map(f => f.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it('produces stable markdown report structure', async () => {
    const ctx = makeCtx(GENERIC_FIXTURES_DIR, 'vite');
    const findings = await frontendAuditModule.run(ctx);
    const report = frontendAuditModule.report(findings, ctx);
    expect(report.markdown).toContain('# Frontend Audit Report');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Findings');
    expect(report.json.schemaVersion).toBe('1.0');
    expect(report.json.auditId).toBe('audit:frontend');
  });

  it('summary counts match findings array length', async () => {
    const ctx = makeCtx(GENERIC_FIXTURES_DIR, 'vite');
    const findings = await frontendAuditModule.run(ctx);
    const report = frontendAuditModule.report(findings, ctx);
    expect(report.json.summary.total).toBe(findings.length);
  });
});
