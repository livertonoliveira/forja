/**
 * E2E smoke tests for the `http_post` policy action — MOB-1015.
 *
 * Covers:
 *   1. Load policies/default.yaml via loadPolicy — must not throw
 *   2. Evaluate a critical finding — decision must be 'fail'
 *   3. No http_post action in default.yaml result (PagerDuty example is commented out)
 *   4. In-memory policy with http_post — executeActions calls fetch with correct method,
 *      Content-Type header, and body (including {{finding.*}} and {{runId}} interpolation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { resetCircuitBreakers } from '../hooks/circuit-breaker.js';

import { loadPolicy } from './parser.js';
import { evaluatePolicy } from './evaluator.js';
import { executeActions } from './actions.js';
import type { Finding } from '../schemas/finding.js';
import { CURRENT_SCHEMA_VERSION } from '../schemas/versioning.js';
import type { PolicyFile } from './parser.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

beforeEach(() => { resetCircuitBreakers(); });

const POLICY_PATH = join(process.cwd(), 'policies/default.yaml');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    runId: 'bbbbbbbb-0000-4000-8000-000000000002',
    phaseId: 'cccccccc-0000-4000-8000-000000000003',
    severity: 'critical',
    category: 'security',
    title: 'SQL Injection',
    description: 'Unsanitised user input reaches a database query',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Minimal in-memory PolicyFile with a single http_post rule */
function makeHttpPostPolicy(url: string): PolicyFile {
  return {
    version: '1',
    policies: [
      {
        name: 'webhook-critical',
        when: { 'finding.severity': 'critical' },
        then: [
          {
            action: 'http_post',
            url,
            headers: { Authorization: 'Bearer {{WEBHOOK_TOKEN}}' },
            payload: {
              run: '{{runId}}',
              event: 'finding',
              title: '{{finding.title}}',
              severity: '{{finding.severity}}',
            },
          },
          { action: 'fail_gate' },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Suite 1 — default.yaml loading and evaluation
// ---------------------------------------------------------------------------

describe('http_post e2e — default.yaml', () => {
  it('loads policies/default.yaml without throwing', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    expect(policy.version).toBe('1');
    expect(Array.isArray(policy.policies)).toBe(true);
    expect(policy.policies.length).toBeGreaterThan(0);
  });

  it('evaluates a critical finding as decision: fail', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    const result = evaluatePolicy([makeFinding()], policy);
    expect(result.decision).toBe('fail');
  });

  it('does not include an http_post action in default.yaml evaluation result', async () => {
    const policy = await loadPolicy(POLICY_PATH);
    const result = evaluatePolicy([makeFinding()], policy);
    const httpPostActions = result.actions.filter(a => a.action === 'http_post');
    expect(httpPostActions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — in-memory http_post policy + mocked fetch
// ---------------------------------------------------------------------------

describe('http_post e2e — in-memory policy with mocked fetch', () => {
  const WEBHOOK_URL = 'https://hooks.example.com/webhook';
  const RUN_ID = 'run-test-1234';

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('evaluatePolicy includes http_post action for a critical finding', () => {
    const policy = makeHttpPostPolicy(WEBHOOK_URL);
    const finding = makeFinding({ title: 'Remote Code Execution', severity: 'critical' });
    const result = evaluatePolicy([finding], policy);
    expect(result.decision).toBe('fail');
    const httpAction = result.actions.find(a => a.action === 'http_post');
    expect(httpAction).toBeDefined();
    expect(httpAction?.url).toBe(WEBHOOK_URL);
  });

  it('executeActions calls fetch with POST method and Content-Type: application/json', async () => {
    const policy = makeHttpPostPolicy(WEBHOOK_URL);
    const finding = makeFinding({ title: 'Prototype Pollution', severity: 'critical' });
    const { actions } = evaluatePolicy([finding], policy);

    await executeActions(actions, { runId: RUN_ID });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(WEBHOOK_URL);
    expect(calledInit.method).toBe('POST');
    const headers = calledInit.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('executeActions sends body with finding fields interpolated at eval-time', async () => {
    // {{finding.*}} tokens are resolved by evaluatePolicy (eval-time).
    // Non-finding tokens ({{runId}}, {{ENV_VAR}}) are preserved by the evaluator
    // and resolved at execution-time by httpPost.
    const policy = makeHttpPostPolicy(WEBHOOK_URL);
    const finding = makeFinding({ title: 'Path Traversal', severity: 'critical' });
    const { actions } = evaluatePolicy([finding], policy);

    await executeActions(actions, { runId: RUN_ID });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(calledInit.body as string) as Record<string, unknown>;

    // {{finding.title}} and {{finding.severity}} are resolved at eval-time
    expect(body.title).toBe('Path Traversal');
    expect(body.severity).toBe('critical');
    expect(body.event).toBe('finding');
    // {{runId}} is preserved by the evaluator (non-finding tokens pass through)
    // and resolved at execution-time by httpPost via ActionContext
    expect(body.run).toBe(RUN_ID);
  });

  it('executeActions interpolates env var in custom header (WEBHOOK_TOKEN)', async () => {
    process.env.WEBHOOK_TOKEN = 'secret-token-xyz';
    try {
      const policy = makeHttpPostPolicy(WEBHOOK_URL);
      const finding = makeFinding();
      const { actions } = evaluatePolicy([finding], policy);

      await executeActions(actions, { runId: RUN_ID });

      const [, calledInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = calledInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer secret-token-xyz');
    } finally {
      delete process.env.WEBHOOK_TOKEN;
    }
  });

  it('executeActions does not throw when fetch returns non-200', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 503 }));
    const policy = makeHttpPostPolicy(WEBHOOK_URL);
    const finding = makeFinding();
    const { actions } = evaluatePolicy([finding], policy);

    const p = executeActions(actions, { runId: RUN_ID });
    await vi.runAllTimersAsync();
    await expect(p).resolves.not.toThrow();
    // 1 initial + 4 retries = 5 fetch calls; 6th attempt hits open circuit (no fetch call)
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('executeActions does not throw when fetch rejects (network error)', async () => {
    // All retry attempts fail
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const policy = makeHttpPostPolicy(WEBHOOK_URL);
    const finding = makeFinding();
    const { actions } = evaluatePolicy([finding], policy);

    const p = executeActions(actions, { runId: RUN_ID });
    await vi.runAllTimersAsync();
    await expect(p).resolves.not.toThrow();
    // 1 initial + 4 retries = 5 fetch calls; 6th attempt hits open circuit (no fetch call)
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('executeActions skips http_post when url is missing and does not throw', async () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'no-url',
          when: { 'finding.severity': 'critical' },
          then: [{ action: 'http_post' }],
        },
      ],
    };
    const finding = makeFinding();
    const { actions } = evaluatePolicy([finding], policy);

    await expect(executeActions(actions, { runId: RUN_ID })).resolves.not.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
