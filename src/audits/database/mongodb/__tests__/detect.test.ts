import { describe, it, expect } from 'vitest';
import { mongodbAuditModule } from '../index.js';

describe('mongodbAuditModule.detect', () => {
  it('returns applicable when database is MongoDB', () => {
    const result = mongodbAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'MongoDB',
    } as Parameters<typeof mongodbAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for lowercase mongodb', () => {
    const result = mongodbAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'mongodb',
    } as Parameters<typeof mongodbAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for "MongoDB Atlas"', () => {
    const result = mongodbAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'MongoDB Atlas',
    } as Parameters<typeof mongodbAuditModule.detect>[0]);
    expect(result.applicable).toBe(true);
  });

  it('returns not applicable when database is not set', () => {
    const result = mongodbAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
    });
    expect(result.applicable).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns not applicable for PostgreSQL', () => {
    const result = mongodbAuditModule.detect({
      language: 'typescript',
      runtime: 'node',
      database: 'PostgreSQL',
    } as Parameters<typeof mongodbAuditModule.detect>[0]);
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain('MongoDB');
  });

  it('returns not applicable for MySQL', () => {
    const result = mongodbAuditModule.detect({
      language: 'python',
      runtime: 'python',
      database: 'MySQL',
    } as Parameters<typeof mongodbAuditModule.detect>[0]);
    expect(result.applicable).toBe(false);
  });
});
