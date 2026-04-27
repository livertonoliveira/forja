import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { securityAuditModule } from '../../../src/audits/security/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../tests/fixtures/audits/security');
const BASELINE_PATH = join(__dirname, 'security-baseline.json');

function makeCtx(generatePocs = false) {
  return {
    cwd: FIXTURES_DIR,
    stack: { language: 'typescript', runtime: 'node', framework: 'express' },
    config: { generatePocs },
    abortSignal: new AbortController().signal,
  };
}

function normalizeFindings(findings: any[]) {
  return findings
    .map(f => ({ category: f.category, severity: f.severity, filePath: f.filePath ?? '' }))
    .sort((a, b) => `${a.category}:${a.filePath}`.localeCompare(`${b.category}:${b.filePath}`));
}

describe('security audit golden test', () => {
  it('detects all baseline findings (zero regressions)', async () => {
    const ctx = makeCtx();
    const findings = await securityAuditModule.run(ctx);
    const normalized = normalizeFindings(findings);

    const baseline: Array<{ category: string; severity: string; filePathContains: string }> =
      JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

    for (const expected of baseline) {
      const found = normalized.some(
        f =>
          f.category === expected.category &&
          f.severity === expected.severity &&
          f.filePath.includes(expected.filePathContains),
      );
      expect(found, `Missing baseline finding: ${expected.category} in ${expected.filePathContains}`).toBe(true);
    }
  });

  it('produces stable markdown report', async () => {
    const ctx = makeCtx();
    const findings = await securityAuditModule.run(ctx);
    const report = securityAuditModule.report(findings, ctx);
    expect(report.markdown).toContain('# Security Audit Report — OWASP Top 10');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Findings');
    expect(report.json.schemaVersion).toBe('1.0');
    expect(report.json.auditId).toBe('audit:security');
  });

  it('summary total matches findings array length', async () => {
    const ctx = makeCtx();
    const findings = await securityAuditModule.run(ctx);
    const report = securityAuditModule.report(findings, ctx);
    expect(report.json.summary.total).toBe(findings.length);
  });

  it('all findings have required fields', async () => {
    const ctx = makeCtx();
    const findings = await securityAuditModule.run(ctx);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.severity).toMatch(/^(low|medium|high|critical)$/);
      expect(f.title).toBeTruthy();
      expect(f.category).toMatch(/^security:owasp:/);
      expect(f.description).toBeTruthy();
    }
  });

  it('all findings include CWE mapping', async () => {
    const ctx = makeCtx();
    const findings = await securityAuditModule.run(ctx);
    for (const f of findings) {
      expect(f.cwe, `Finding "${f.title}" is missing CWE mapping`).toMatch(/^CWE-\d+$/);
    }
  });

  it('detect() returns applicable for any stack', () => {
    for (const stack of [
      { language: 'typescript', runtime: 'node' },
      { language: 'python', runtime: 'cpython', framework: 'django' },
      { language: 'go', runtime: 'go' },
    ]) {
      const result = securityAuditModule.detect(stack);
      expect(result.applicable).toBe(true);
    }
  });

  it('PoC report generated when generatePocs = true and critical/high findings present', async () => {
    const ctx = makeCtx(true);
    const findings = await securityAuditModule.run(ctx);
    const report = securityAuditModule.report(findings, ctx);
    const hasCriticalOrHigh = findings.some(
      f => (f.severity === 'critical' || f.severity === 'high') && f.exploitVector,
    );
    if (hasCriticalOrHigh) {
      expect(report.markdown).toContain('# Security PoC Report');
      expect(report.markdown).toContain('DISCLAIMER');
    }
  });

  it('PoC NOT included when generatePocs = false', async () => {
    const ctx = makeCtx(false);
    const findings = await securityAuditModule.run(ctx);
    const report = securityAuditModule.report(findings, ctx);
    expect(report.markdown).not.toContain('# Security PoC Report');
  });
});
