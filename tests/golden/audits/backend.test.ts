import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { backendAuditModule } from '../../../src/audits/backend/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../tests/fixtures/audits/backend');
const BASELINE_PATH = join(__dirname, 'backend-baseline.json');

function makeCtx(cwd: string) {
  return {
    cwd,
    stack: { language: 'typescript', runtime: 'node', framework: 'NestJS' },
    config: {},
    abortSignal: new AbortController().signal,
  };
}

function normalizeFindings(findings: any[]) {
  return findings
    .map(f => ({ category: f.category, severity: f.severity, filePath: f.filePath ?? '' }))
    .sort((a, b) => `${a.category}:${a.filePath}`.localeCompare(`${b.category}:${b.filePath}`));
}

describe('backend audit golden test', () => {
  it('detects all baseline findings (zero regressions)', async () => {
    const ctx = makeCtx(FIXTURES_DIR);
    const findings = await backendAuditModule.run(ctx);
    const normalized = normalizeFindings(findings);

    const baseline: Array<{ category: string; severity: string; filePathContains: string }> =
      JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

    for (const expected of baseline) {
      const found = normalized.some(
        f =>
          f.category === expected.category &&
          f.severity === expected.severity &&
          f.filePath.includes(expected.filePathContains)
      );
      expect(found, `Missing baseline finding: ${expected.category} in ${expected.filePathContains}`).toBe(true);
    }
  });

  it('produces stable markdown snapshot', async () => {
    const ctx = makeCtx(FIXTURES_DIR);
    const findings = await backendAuditModule.run(ctx);
    const report = backendAuditModule.report(findings, ctx);

    // Snapshot: check structural stability (sections present)
    expect(report.markdown).toContain('# Backend Audit Report');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Findings');
    expect(report.json.schemaVersion).toBe('1.0');
    expect(report.json.auditId).toBe('audit:backend');
  });

  it('summary counts match findings array length', async () => {
    const ctx = makeCtx(FIXTURES_DIR);
    const findings = await backendAuditModule.run(ctx);
    const report = backendAuditModule.report(findings, ctx);
    expect(report.json.summary.total).toBe(findings.length);
  });
});
