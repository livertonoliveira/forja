import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AuditFindingSchema, AuditReportSchema } from '../types.js';

describe('AuditFindingSchema', () => {
  it('parses a valid finding', () => {
    const valid = {
      schemaVersion: '1.0',
      id: 'finding-001',
      severity: 'high',
      title: 'SQL Injection',
      category: 'security',
      description: 'Unsanitized user input used in SQL query.',
    };
    expect(() => AuditFindingSchema.parse(valid)).not.toThrow();
  });

  it('accepts all optional fields', () => {
    const valid = {
      schemaVersion: '1.0',
      id: 'finding-002',
      severity: 'critical',
      title: 'RCE',
      category: 'security',
      description: 'Remote code execution.',
      filePath: 'src/index.ts',
      line: 42,
      endLine: 50,
      snippet: 'eval(userInput)',
      cwe: 'CWE-78',
      remediation: 'Sanitize input before eval.',
      confidence: 'high',
    };
    expect(() => AuditFindingSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid severity', () => {
    expect(() =>
      AuditFindingSchema.parse({
        schemaVersion: '1.0',
        id: 'f1',
        severity: 'urgent', // invalid
        title: 'T',
        category: 'c',
        description: 'd',
      })
    ).toThrow(z.ZodError);
  });

  it('accepts any schemaVersion string', () => {
    const result = AuditFindingSchema.parse({
      schemaVersion: '2.0',
      id: 'f1',
      severity: 'low',
      title: 'T',
      category: 'c',
      description: 'd',
    });
    expect(result.schemaVersion).toBe('2.0');
  });

  it('severity field has the correct enum values', () => {
    const severitySchema = AuditFindingSchema.shape.severity;
    expect(severitySchema.options).toEqual(['low', 'medium', 'high', 'critical']);
  });
});

describe('AuditReportSchema', () => {
  it('parses a valid report', () => {
    const valid = {
      schemaVersion: '1.0',
      auditId: 'audit:backend:nestjs',
      stackInfo: { language: 'typescript', runtime: 'node' },
      startedAt: '2024-01-01T00:00:00.000Z',
      finishedAt: '2024-01-01T00:01:00.000Z',
      findings: [],
      markdown: '# Audit Report\nNo issues found.',
      summary: { total: 0, bySeverity: {} },
    };
    expect(() => AuditReportSchema.parse(valid)).not.toThrow();
  });

  it('rejects report with invalid startedAt', () => {
    expect(() =>
      AuditReportSchema.parse({
        schemaVersion: '1.0',
        auditId: 'audit:backend:nestjs',
        stackInfo: { language: 'typescript', runtime: 'node' },
        startedAt: 'not-a-date',
        finishedAt: '2024-01-01T00:01:00.000Z',
        findings: [],
        markdown: '',
        summary: { total: 0, bySeverity: {} },
      })
    ).toThrow(z.ZodError);
  });
});
