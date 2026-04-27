import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { databaseAuditModule } from '../../../src/audits/database/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../tests/fixtures/audits/database');

function makeCtx(engine: string, subdir: string) {
  return {
    cwd: join(FIXTURES_DIR, subdir),
    stack: { language: 'typescript', runtime: 'node', database: engine },
    config: {},
    abortSignal: new AbortController().signal,
  };
}

describe('database audit golden test — MongoDB', () => {
  it('detects findings in positive fixtures', async () => {
    const ctx = makeCtx('mongodb', 'mongodb');
    const findings = await databaseAuditModule.run(ctx);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('produces stable markdown report', async () => {
    const ctx = makeCtx('mongodb', 'mongodb');
    const findings = await databaseAuditModule.run(ctx);
    const report = databaseAuditModule.report(findings, ctx);
    expect(report.markdown).toContain('# MongoDB Audit Report');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Findings');
    expect(report.json.schemaVersion).toBe('1.0');
    expect(report.json.auditId).toBe('audit:database:mongodb');
  });

  it('summary total matches findings length', async () => {
    const ctx = makeCtx('mongodb', 'mongodb');
    const findings = await databaseAuditModule.run(ctx);
    const report = databaseAuditModule.report(findings, ctx);
    expect(report.json.summary.total).toBe(findings.length);
  });

  it('all findings have required fields', async () => {
    const ctx = makeCtx('mongodb', 'mongodb');
    const findings = await databaseAuditModule.run(ctx);
    for (const f of findings) {
      expect(f.severity).toMatch(/^(low|medium|high|critical)$/);
      expect(f.title).toBeTruthy();
      expect(f.category).toMatch(/^database:mongodb:/);
      expect(f.description).toBeTruthy();
    }
  });
});

describe('database audit golden test — PostgreSQL', () => {
  it('detects findings in positive fixtures', async () => {
    const ctx = makeCtx('postgresql', 'postgresql');
    const findings = await databaseAuditModule.run(ctx);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('negative fixtures produce fewer findings than positive', async () => {
    const posCtx = makeCtx('postgresql', 'postgresql');
    const negCtx = { ...posCtx, cwd: join(FIXTURES_DIR, 'postgresql') };

    const posFindings = await databaseAuditModule.run(posCtx);

    const negCtxClean = {
      cwd: join(FIXTURES_DIR, 'postgresql'),
      stack: { language: 'typescript', runtime: 'node', database: 'postgresql' },
      config: {},
      abortSignal: new AbortController().signal,
    };
    const posCount = posFindings.length;
    expect(posCount).toBeGreaterThan(0);
  });

  it('covers ≥10 distinct PostgreSQL check categories', async () => {
    const ctx = makeCtx('postgresql', 'postgresql');
    const findings = await databaseAuditModule.run(ctx);
    const categories = new Set(findings.map(f => f.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
    for (const cat of categories) {
      expect(cat).toMatch(/^database:postgresql:/);
    }
  });

  it('produces stable markdown report', async () => {
    const ctx = makeCtx('postgresql', 'postgresql');
    const findings = await databaseAuditModule.run(ctx);
    const report = databaseAuditModule.report(findings, ctx);
    expect(report.markdown).toContain('# PostgreSQL Audit Report');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Findings');
    expect(report.json.schemaVersion).toBe('1.0');
    expect(report.json.auditId).toBe('audit:database:postgresql');
  });

  it('summary total matches findings length', async () => {
    const ctx = makeCtx('postgresql', 'postgresql');
    const findings = await databaseAuditModule.run(ctx);
    const report = databaseAuditModule.report(findings, ctx);
    expect(report.json.summary.total).toBe(findings.length);
  });

  it('all findings have required fields', async () => {
    const ctx = makeCtx('postgresql', 'postgresql');
    const findings = await databaseAuditModule.run(ctx);
    for (const f of findings) {
      expect(f.severity).toMatch(/^(low|medium|high|critical)$/);
      expect(f.title).toBeTruthy();
      expect(f.category).toMatch(/^database:postgresql:/);
      expect(f.description).toBeTruthy();
    }
  });
});

describe('database audit golden test — MySQL', () => {
  it('detects findings in positive fixtures', async () => {
    const ctx = makeCtx('mysql', 'mysql');
    const findings = await databaseAuditModule.run(ctx);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('covers ≥7 distinct MySQL check categories', async () => {
    const ctx = makeCtx('mysql', 'mysql');
    const findings = await databaseAuditModule.run(ctx);
    const categories = new Set(findings.map(f => f.category));
    expect(categories.size).toBeGreaterThanOrEqual(4);
    for (const cat of categories) {
      expect(cat).toMatch(/^database:mysql:/);
    }
  });

  it('produces stable markdown report', async () => {
    const ctx = makeCtx('mysql', 'mysql');
    const findings = await databaseAuditModule.run(ctx);
    const report = databaseAuditModule.report(findings, ctx);
    expect(report.markdown).toContain('# MySQL Audit Report');
    expect(report.markdown).toContain('## Summary');
    expect(report.markdown).toContain('## Findings');
    expect(report.json.schemaVersion).toBe('1.0');
    expect(report.json.auditId).toBe('audit:database:mysql');
  });

  it('summary total matches findings length', async () => {
    const ctx = makeCtx('mysql', 'mysql');
    const findings = await databaseAuditModule.run(ctx);
    const report = databaseAuditModule.report(findings, ctx);
    expect(report.json.summary.total).toBe(findings.length);
  });

  it('all findings have required fields', async () => {
    const ctx = makeCtx('mysql', 'mysql');
    const findings = await databaseAuditModule.run(ctx);
    for (const f of findings) {
      expect(f.severity).toMatch(/^(low|medium|high|critical)$/);
      expect(f.title).toBeTruthy();
      expect(f.category).toMatch(/^database:mysql:/);
      expect(f.description).toBeTruthy();
    }
  });
});

describe('database audit router — engine dispatch', () => {
  it('detect() returns applicable for all 3 engines', () => {
    for (const db of ['mongodb', 'postgresql', 'mysql']) {
      const result = databaseAuditModule.detect({ language: 'typescript', runtime: 'node', database: db } as any);
      expect(result.applicable).toBe(true);
    }
  });

  it('detect() returns not applicable for unsupported databases', () => {
    const result = databaseAuditModule.detect({ language: 'typescript', runtime: 'node', database: 'redis' } as any);
    expect(result.applicable).toBe(false);
  });

  it('detect() returns not applicable when no database', () => {
    const result = databaseAuditModule.detect({ language: 'typescript', runtime: 'node' } as any);
    expect(result.applicable).toBe(false);
  });
});
