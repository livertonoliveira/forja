/**
 * Unit tests for src/integrations/factory.ts — MOB-1083.
 *
 * Tests:
 *  - getIntegrationProvider returns null when no factories are registered
 *  - registerProviderFactory adds a factory to the registry
 *  - getIntegrationProvider calls factories in order and returns first non-null
 *  - getIntegrationProvider returns null if all factories return null
 *  - Factory that checks config.jira?.token works correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerProviderFactory,
  getIntegrationProvider,
  resetProviderFactories,
  type IntegrationConfig,
  type ProviderFactory,
} from '../factory.js';
import { MockIntegrationProvider } from '../mock.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAlwaysNullFactory(): ProviderFactory {
  return (_config: IntegrationConfig) => null;
}

function makeAlwaysMockFactory(): ProviderFactory {
  return (_config: IntegrationConfig) => new MockIntegrationProvider();
}

function makeJiraFactory(): ProviderFactory {
  return (config: IntegrationConfig) => {
    if (!config.jira?.token) return null;
    return new MockIntegrationProvider();
  };
}

const EMPTY_CONFIG: IntegrationConfig = {};

const JIRA_CONFIG: IntegrationConfig = {
  jira: {
    baseUrl: 'https://acme.atlassian.net',
    email: 'admin@acme.com',
    token: 'jira-token-abc',
    projectKey: 'PROJ',
  },
};

// ---------------------------------------------------------------------------
// Isolation: reset registry before and after every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetProviderFactories();
});

afterEach(() => {
  resetProviderFactories();
});

// ---------------------------------------------------------------------------
// getIntegrationProvider — no factories registered
// ---------------------------------------------------------------------------

describe('getIntegrationProvider — empty registry', () => {
  it('returns null when no factories are registered', async () => {
    const provider = await getIntegrationProvider(EMPTY_CONFIG);
    expect(provider).toBeNull();
  });

  it('returns null for any config when registry is empty', async () => {
    const provider = await getIntegrationProvider(JIRA_CONFIG);
    expect(provider).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// registerProviderFactory — basic registration
// ---------------------------------------------------------------------------

describe('registerProviderFactory — basic registration', () => {
  it('registers a factory and getIntegrationProvider calls it', async () => {
    let called = false;
    registerProviderFactory((_config) => {
      called = true;
      return null;
    });

    await getIntegrationProvider(EMPTY_CONFIG);
    expect(called).toBe(true);
  });

  it('returns a provider from a registered factory', async () => {
    registerProviderFactory(makeAlwaysMockFactory());
    const provider = await getIntegrationProvider(EMPTY_CONFIG);
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('mock');
  });
});

// ---------------------------------------------------------------------------
// getIntegrationProvider — multiple factories, first non-null wins
// ---------------------------------------------------------------------------

describe('getIntegrationProvider — factory ordering', () => {
  it('returns the first non-null provider when multiple factories are registered', async () => {
    const firstMock = new MockIntegrationProvider();
    const callOrder: string[] = [];

    registerProviderFactory((_config) => {
      callOrder.push('first');
      return firstMock;
    });
    registerProviderFactory((_config) => {
      callOrder.push('second');
      return new MockIntegrationProvider();
    });

    const provider = await getIntegrationProvider(EMPTY_CONFIG);

    expect(provider).toBe(firstMock);
    // Second factory should NOT be called once first returns non-null
    expect(callOrder).toEqual(['first']);
  });

  it('skips null-returning factories and returns first non-null result', async () => {
    const secondMock = new MockIntegrationProvider();
    const callOrder: string[] = [];

    registerProviderFactory((_config) => {
      callOrder.push('first');
      return null;
    });
    registerProviderFactory((_config) => {
      callOrder.push('second');
      return secondMock;
    });

    const provider = await getIntegrationProvider(EMPTY_CONFIG);

    expect(provider).toBe(secondMock);
    expect(callOrder).toEqual(['first', 'second']);
  });

  it('returns null if all factories return null', async () => {
    registerProviderFactory(makeAlwaysNullFactory());
    registerProviderFactory(makeAlwaysNullFactory());
    registerProviderFactory(makeAlwaysNullFactory());

    const provider = await getIntegrationProvider(EMPTY_CONFIG);
    expect(provider).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getIntegrationProvider — config-aware factory (jira?.token)
// ---------------------------------------------------------------------------

describe('getIntegrationProvider — config-aware factory', () => {
  it('returns null when config.jira is undefined', async () => {
    registerProviderFactory(makeJiraFactory());
    const provider = await getIntegrationProvider(EMPTY_CONFIG);
    expect(provider).toBeNull();
  });

  it('returns null when config.jira.token is missing', async () => {
    registerProviderFactory(makeJiraFactory());
    // jira object present but token is empty string (falsy)
    const config: IntegrationConfig = {
      jira: {
        baseUrl: 'https://acme.atlassian.net',
        email: 'admin@acme.com',
        token: '',
        projectKey: 'PROJ',
      },
    };
    const provider = await getIntegrationProvider(config);
    expect(provider).toBeNull();
  });

  it('returns a provider when config.jira.token is present', async () => {
    registerProviderFactory(makeJiraFactory());
    const provider = await getIntegrationProvider(JIRA_CONFIG);
    expect(provider).not.toBeNull();
    expect(provider!.name).toBe('mock');
  });

  it('passes the full config object to the factory', async () => {
    let receivedConfig: IntegrationConfig | undefined;
    registerProviderFactory((config) => {
      receivedConfig = config;
      return null;
    });

    await getIntegrationProvider(JIRA_CONFIG);
    expect(receivedConfig).toEqual(JIRA_CONFIG);
  });
});

// ---------------------------------------------------------------------------
// resetProviderFactories — isolation guarantee
// ---------------------------------------------------------------------------

describe('resetProviderFactories — isolation', () => {
  it('clears all registered factories', async () => {
    registerProviderFactory(makeAlwaysMockFactory());
    resetProviderFactories();
    const provider = await getIntegrationProvider(EMPTY_CONFIG);
    expect(provider).toBeNull();
  });

  it('allows re-registering after a reset', async () => {
    registerProviderFactory(makeAlwaysNullFactory());
    resetProviderFactories();
    registerProviderFactory(makeAlwaysMockFactory());
    const provider = await getIntegrationProvider(EMPTY_CONFIG);
    expect(provider).not.toBeNull();
  });
});
