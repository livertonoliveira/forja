import { describe, it, expect } from 'vitest';
import { postgresqlAuditModule } from '../index.js';

describe('postgresqlAuditModule.detect', () => {
  it('returns applicable when database is PostgreSQL', () => {
    const result = postgresqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'PostgreSQL',
    } as Parameters<typeof postgresqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for lowercase postgresql', () => {
    const result = postgresqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'postgresql',
    } as Parameters<typeof postgresqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for "PostgreSQL 16"', () => {
    const result = postgresqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'PostgreSQL 16',
    } as Parameters<typeof postgresqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns not applicable when database is not set', () => {
    const result = postgresqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
    });
    expect(result.applicable).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns not applicable for MongoDB', () => {
    const result = postgresqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'MongoDB',
    } as Parameters<typeof postgresqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(false);
  });

  it('returns not applicable for MySQL', () => {
    const result = postgresqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'MySQL',
    } as Parameters<typeof postgresqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(false);
  });
});
