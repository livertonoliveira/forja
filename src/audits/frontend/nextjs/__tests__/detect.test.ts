import { describe, it, expect } from 'vitest';
import { frontendAuditModule } from '../../index.js';

describe('frontendAuditModule.detect', () => {
  it('returns applicable for Next.js', () => {
    const result = frontendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'Next.js' });
    expect(result.applicable).toBe(true);
  });

  it('returns applicable for nextjs (lowercase)', () => {
    expect(frontendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'nextjs' }).applicable).toBe(true);
  });

  it('returns applicable for Vite', () => {
    expect(frontendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'Vite' }).applicable).toBe(true);
  });

  it('returns applicable for React', () => {
    expect(frontendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'React' }).applicable).toBe(true);
  });

  it('returns applicable for Vue', () => {
    expect(frontendAuditModule.detect({ language: 'javascript', runtime: 'node', framework: 'Vue' }).applicable).toBe(true);
  });

  it('returns applicable for Angular', () => {
    expect(frontendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'Angular' }).applicable).toBe(true);
  });

  it('returns applicable for Svelte', () => {
    expect(frontendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'Svelte' }).applicable).toBe(true);
  });

  it('returns applicable for Nuxt', () => {
    expect(frontendAuditModule.detect({ language: 'typescript', runtime: 'node', framework: 'Nuxt' }).applicable).toBe(true);
  });

  it('returns not applicable when no framework', () => {
    const result = frontendAuditModule.detect({ language: 'typescript', runtime: 'node' });
    expect(result.applicable).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns not applicable for backend-only frameworks', () => {
    const result = frontendAuditModule.detect({ language: 'go', runtime: 'go', framework: 'Gin' });
    expect(result.applicable).toBe(false);
    expect(result.reason).toContain('Gin');
  });
});
