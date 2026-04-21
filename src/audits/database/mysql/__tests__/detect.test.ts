import { describe, it, expect } from 'vitest';
import { mysqlAuditModule } from '../index.js';

describe('mysqlAuditModule.detect', () => {
  it('returns applicable when database is MySQL', () => {
    const result = mysqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'MySQL',
    } as Parameters<typeof mysqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for lowercase mysql', () => {
    const result = mysqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'mysql',
    } as Parameters<typeof mysqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for "MySQL 8.0"', () => {
    const result = mysqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'MySQL 8.0',
    } as Parameters<typeof mysqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns not applicable when database is not set', () => {
    const result = mysqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
    });
    expect(result.applicable).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns not applicable for MongoDB', () => {
    const result = mysqlAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'MongoDB',
    } as Parameters<typeof mysqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain('MySQL');
  });

  it('returns not applicable for PostgreSQL', () => {
    const result = mysqlAuditModule.detect({
      language: 'python',
      runtime: 'python',
      database: 'PostgreSQL',
    } as Parameters<typeof mysqlAuditModule.detect>[0]);
    expect(result.applicable).toBe(false);
  });
});
