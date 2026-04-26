/**
 * Integration tests for src/integrations/doctor-check.ts — MOB-1083.
 *
 * Tests:
 *  - The 'integration-provider' check is registered after importing doctor-check.ts
 *  - Returns 'pass' when no provider is configured (no factories registered)
 *  - Returns 'pass' when a registered mock provider reports ok: true
 *  - Returns 'warn' when a registered mock provider reports ok: false
 *  - Returns 'fail' when provider.healthCheck() throws
 *
 * Isolation strategy:
 *  - The factory registry (_factories in factory.ts) is reset between tests via
 *    resetProviderFactories().
 *  - doctor-check.ts is imported once (it registers the check at module load), so
 *    the getChecks() array has that single check entry for all tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getChecks } from '../../cli/doctor/check.js';
import {
  registerProviderFactory,
  resetProviderFactories,
} from '../factory.js';
import type { IntegrationProvider } from '../base.js';
import { MockIntegrationProvider } from '../mock.js';

// ---------------------------------------------------------------------------
// Import the side-effectful module that registers the doctor check.
// This MUST be imported once — the registerCheck() call happens at module load.
// ---------------------------------------------------------------------------

import '../doctor-check.js';

// ---------------------------------------------------------------------------
// Isolation: reset factory registry before/after every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetProviderFactories();
  // Also clear all env vars used by buildIntegrationConfigFromEnv
  delete process.env.JIRA_TOKEN;
  delete process.env.GITLAB_TOKEN;
  delete process.env.AZURE_DEVOPS_TOKEN;
  delete process.env.BITBUCKET_APP_PASSWORD;
});

afterEach(() => {
  resetProviderFactories();
  delete process.env.JIRA_TOKEN;
  delete process.env.GITLAB_TOKEN;
  delete process.env.AZURE_DEVOPS_TOKEN;
  delete process.env.BITBUCKET_APP_PASSWORD;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper to find the integration-provider check
// ---------------------------------------------------------------------------

function getIntegrationProviderCheck() {
  return getChecks().find((c) => c.name === 'integration-provider');
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('doctor-check — registration', () => {
  it('registers a check with name "integration-provider"', () => {
    const check = getIntegrationProviderCheck();
    expect(check).toBeDefined();
    expect(check!.name).toBe('integration-provider');
  });

  it('registered check has a run() function', () => {
    const check = getIntegrationProviderCheck();
    expect(typeof check!.run).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// No provider configured (no env vars, no factories) → pass
// ---------------------------------------------------------------------------

describe('doctor-check — no provider configured', () => {
  it('returns status "pass" when no factories are registered and no env vars are set', async () => {
    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.status).toBe('pass');
  });

  it('includes "optional" in the message when no provider is configured', async () => {
    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.message).toMatch(/optional/i);
  });
});

// ---------------------------------------------------------------------------
// Mock provider that returns ok: true → pass
// ---------------------------------------------------------------------------

describe('doctor-check — provider healthy', () => {
  it('returns status "pass" when provider.healthCheck returns ok: true', async () => {
    // Register a factory that always returns a healthy MockIntegrationProvider
    registerProviderFactory((_config) => new MockIntegrationProvider());

    // The doctor-check builds config from env vars; to ensure our factory fires
    // we need at least one env var to produce a non-empty config — but actually
    // the factory ignores config entirely and always returns a provider.
    // We can also just rely on the factory returning non-null for any config.

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.status).toBe('pass');
  });

  it('includes provider name in the message when healthy', async () => {
    registerProviderFactory((_config) => new MockIntegrationProvider());

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.message).toContain('mock');
  });

  it('includes latencyMs in the message when healthy', async () => {
    registerProviderFactory((_config) => new MockIntegrationProvider());

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    // Message should mention the latency in milliseconds
    expect(result.message).toContain('ms');
  });
});

// ---------------------------------------------------------------------------
// Mock provider that returns ok: false → warn
// ---------------------------------------------------------------------------

describe('doctor-check — provider unhealthy (ok: false)', () => {
  it('returns status "warn" when provider.healthCheck returns ok: false', async () => {
    // Create a provider whose healthCheck reports ok: false
    const unhealthyProvider: IntegrationProvider = {
      name: 'unhealthy-mock',
      async createIssue() { return { id: '1', url: 'x', provider: 'unhealthy-mock' }; },
      async updateIssue() {},
      async closeIssue() {},
      async createPR() { return { id: '1', url: 'x', provider: 'unhealthy-mock' }; },
      async addComment() {},
      async healthCheck() { return { ok: false, latencyMs: 500 }; },
    };

    registerProviderFactory((_config) => unhealthyProvider);

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.status).toBe('warn');
  });

  it('includes provider name in the message when unhealthy', async () => {
    const unhealthyProvider: IntegrationProvider = {
      name: 'unhealthy-mock',
      async createIssue() { return { id: '1', url: 'x', provider: 'unhealthy-mock' }; },
      async updateIssue() {},
      async closeIssue() {},
      async createPR() { return { id: '1', url: 'x', provider: 'unhealthy-mock' }; },
      async addComment() {},
      async healthCheck() { return { ok: false, latencyMs: 100 }; },
    };

    registerProviderFactory((_config) => unhealthyProvider);

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.message).toContain('unhealthy-mock');
  });

  it('includes remediation when unhealthy', async () => {
    const unhealthyProvider: IntegrationProvider = {
      name: 'unhealthy-mock',
      async createIssue() { return { id: '1', url: 'x', provider: 'unhealthy-mock' }; },
      async updateIssue() {},
      async closeIssue() {},
      async createPR() { return { id: '1', url: 'x', provider: 'unhealthy-mock' }; },
      async addComment() {},
      async healthCheck() { return { ok: false, latencyMs: 100 }; },
    };

    registerProviderFactory((_config) => unhealthyProvider);

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.remediation).toBeDefined();
    expect(result.remediation).toContain('unhealthy-mock');
  });
});

// ---------------------------------------------------------------------------
// Provider healthCheck throws → fail
// ---------------------------------------------------------------------------

describe('doctor-check — provider throws on healthCheck', () => {
  it('returns status "fail" when provider.healthCheck throws an Error', async () => {
    const throwingProvider: IntegrationProvider = {
      name: 'throwing-mock',
      async createIssue() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async updateIssue() {},
      async closeIssue() {},
      async createPR() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async addComment() {},
      async healthCheck() { throw new Error('Connection refused'); },
    };

    registerProviderFactory((_config) => throwingProvider);

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.status).toBe('fail');
  });

  it('includes the error message in the fail message', async () => {
    const throwingProvider: IntegrationProvider = {
      name: 'throwing-mock',
      async createIssue() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async updateIssue() {},
      async closeIssue() {},
      async createPR() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async addComment() {},
      async healthCheck() { throw new Error('Connection refused'); },
    };

    registerProviderFactory((_config) => throwingProvider);

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.message).toContain('Connection refused');
  });

  it('returns status "fail" when provider.healthCheck throws a non-Error value', async () => {
    const throwingProvider: IntegrationProvider = {
      name: 'throwing-mock',
      async createIssue() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async updateIssue() {},
      async closeIssue() {},
      async createPR() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async addComment() {},
      async healthCheck() { throw 'plain string error'; },
    };

    registerProviderFactory((_config) => throwingProvider);

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.status).toBe('fail');
    expect(result.message).toContain('plain string error');
  });

  it('includes remediation when healthCheck throws', async () => {
    const throwingProvider: IntegrationProvider = {
      name: 'throwing-mock',
      async createIssue() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async updateIssue() {},
      async closeIssue() {},
      async createPR() { return { id: '1', url: 'x', provider: 'throwing-mock' }; },
      async addComment() {},
      async healthCheck() { throw new Error('timeout'); },
    };

    registerProviderFactory((_config) => throwingProvider);

    const check = getIntegrationProviderCheck()!;
    const result = await check.run();
    expect(result.remediation).toBeDefined();
    expect(result.remediation).toContain('throwing-mock');
  });
});
