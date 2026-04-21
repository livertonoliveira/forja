import { describe, it, expect } from 'vitest';
import { backendAuditModule } from '../index.js';

describe('backendAuditModule.detect', () => {
  it('returns applicable for NestJS', () => {
    const result = backendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'NestJS' });
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for Express', () => {
    expect(backendAuditModule.detect({ language: 'javascript', runtime: 'node', framework: 'Express' }).applicable).toBe(true);
  });

  it('returns applicable for Fastify', () => {
    expect(backendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'Fastify' }).applicable).toBe(true);
  });

  it('returns applicable for FastAPI', () => {
    expect(backendAuditModule.detect({ language: 'python', runtime: 'python', framework: 'FastAPI' }).applicable).toBe(true);
  });

  it('returns applicable for Rails', () => {
    expect(backendAuditModule.detect({ language: 'ruby', runtime: 'ruby', framework: 'Rails' }).applicable).toBe(true);
  });

  it('returns not applicable when no framework', () => {
    const result = backendAuditModule.detect({ language: 'typescript', runtime: 'node' });
    expect(result.applicable).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns not applicable for unsupported framework', () => {
    const result = backendAuditModule.detect({ language: 'go', runtime: 'go', framework: 'Gin' });
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain('Gin');
  });
});
