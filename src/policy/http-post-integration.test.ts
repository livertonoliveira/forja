import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Finding } from '../schemas/finding.js';
import type { PolicyFile } from './parser.js';
import { PolicyFileSchema } from './parser.js';
import { evaluatePolicy } from './evaluator.js';
import { executeActions } from './actions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const UUID = '00000000-0000-0000-0000-000000000000';
const ISO_DT = '2024-01-01T00:00:00.000Z';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: UUID,
    runId: UUID,
    phaseId: UUID,
    severity: 'critical',
    category: 'security',
    title: 'SQL Injection',
    description: 'A critical SQL injection vulnerability was detected.',
    createdAt: ISO_DT,
    ...overrides,
  };
}

function makeOkResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
  } as Response;
}

// ---------------------------------------------------------------------------
// 1. Parsing — http_post action parses correctly via PolicyFileSchema
// ---------------------------------------------------------------------------
describe('http_post — policy parsing', () => {
  it('parses a policy rule with action: http_post and all optional fields', () => {
    const raw = {
      version: '1',
      policies: [
        {
          name: 'webhook-critical',
          when: { 'finding.severity': 'critical' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/notify',
              payload: {
                event: 'finding_detected',
                title: '{{finding.title}}',
                severity: '{{finding.severity}}',
              },
              headers: {
                'X-Api-Key': 'secret-token',
                'X-Run-Id': '{{runId}}',
              },
            },
          ],
        },
      ],
    };

    expect(() => PolicyFileSchema.parse(raw)).not.toThrow();
    const policy = PolicyFileSchema.parse(raw);
    const action = policy.policies[0].then[0];

    expect(action.action).toBe('http_post');
    expect(action.url).toBe('https://hooks.example.com/notify');
    expect(action.payload).toEqual({
      event: 'finding_detected',
      title: '{{finding.title}}',
      severity: '{{finding.severity}}',
    });
    expect(action.headers).toEqual({
      'X-Api-Key': 'secret-token',
      'X-Run-Id': '{{runId}}',
    });
  });

  it('parses a policy rule with action: http_post and only url (no payload/headers)', () => {
    const raw = {
      version: '1',
      policies: [
        {
          name: 'minimal-webhook',
          when: { 'finding.severity': 'high' },
          then: [{ action: 'http_post', url: 'https://hooks.example.com/minimal' }],
        },
      ],
    };

    expect(() => PolicyFileSchema.parse(raw)).not.toThrow();
    const policy = PolicyFileSchema.parse(raw);
    const action = policy.policies[0].then[0];

    expect(action.action).toBe('http_post');
    expect(action.url).toBe('https://hooks.example.com/minimal');
    expect(action.payload).toBeUndefined();
    expect(action.headers).toBeUndefined();
  });

  it('parses a policy rule with action: http_post without url (url is optional)', () => {
    const raw = {
      version: '1',
      policies: [
        {
          name: 'no-url-webhook',
          when: { 'finding.severity': 'medium' },
          then: [{ action: 'http_post' }],
        },
      ],
    };

    expect(() => PolicyFileSchema.parse(raw)).not.toThrow();
    const policy = PolicyFileSchema.parse(raw);
    expect(policy.policies[0].then[0].action).toBe('http_post');
    expect(policy.policies[0].then[0].url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Evaluation — evaluatePolicy produces http_post action in result
// ---------------------------------------------------------------------------
describe('http_post — evaluatePolicy produces action', () => {
  const httpPostPolicy: PolicyFile = {
    version: '1',
    policies: [
      {
        name: 'webhook-critical',
        when: { 'finding.severity': 'critical' },
        then: [
          {
            action: 'http_post',
            url: 'https://hooks.example.com/notify',
            payload: { title: '{{finding.title}}', severity: '{{finding.severity}}' },
            headers: { 'X-Api-Key': 'token-abc' },
          },
        ],
      },
    ],
  };

  it('produces an http_post action when the matching finding is evaluated', () => {
    const finding = makeFinding({ severity: 'critical', title: 'RCE' });
    const result = evaluatePolicy([finding], httpPostPolicy);

    const httpAction = result.actions.find(a => a.action === 'http_post');
    expect(httpAction).toBeDefined();
    expect(httpAction?.url).toBe('https://hooks.example.com/notify');
  });

  it('does not produce http_post action when no finding matches the rule', () => {
    const finding = makeFinding({ severity: 'low' });
    const result = evaluatePolicy([finding], httpPostPolicy);

    const httpAction = result.actions.find(a => a.action === 'http_post');
    expect(httpAction).toBeUndefined();
  });

  it('includes the matched rule name in matchedRules', () => {
    const finding = makeFinding({ severity: 'critical' });
    const result = evaluatePolicy([finding], httpPostPolicy);

    expect(result.matchedRules).toContain('webhook-critical');
  });
});

// ---------------------------------------------------------------------------
// 3. Interpolation — evaluatePolicy interpolates {{finding.*}} in payload/url
// ---------------------------------------------------------------------------
describe('http_post — template interpolation in evaluatePolicy', () => {
  it('interpolates {{finding.title}} in payload string values', () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'webhook-interpolate',
          when: { 'finding.severity': 'critical' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/notify',
              payload: { title: '{{finding.title}}', severity: '{{finding.severity}}' },
            },
          ],
        },
      ],
    };

    const finding = makeFinding({ severity: 'critical', title: 'SQL Injection' });
    const result = evaluatePolicy([finding], policy);
    const httpAction = result.actions.find(a => a.action === 'http_post');

    expect(httpAction?.payload).toEqual({ title: 'SQL Injection', severity: 'critical' });
  });

  it('interpolates {{finding.title}} in the url field', () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'webhook-url-interpolate',
          when: { 'finding.severity': 'high' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/{{finding.category}}/notify',
            },
          ],
        },
      ],
    };

    const finding = makeFinding({ severity: 'high', category: 'injection' });
    const result = evaluatePolicy([finding], policy);
    const httpAction = result.actions.find(a => a.action === 'http_post');

    expect(httpAction?.url).toBe('https://hooks.example.com/injection/notify');
  });

  it('interpolates nested payload string values', () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'webhook-nested',
          when: { 'finding.severity': 'critical' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/notify',
              payload: {
                finding: {
                  name: '{{finding.title}}',
                  sev: '{{finding.severity}}',
                },
              },
            },
          ],
        },
      ],
    };

    const finding = makeFinding({ severity: 'critical', title: 'XSS Attack' });
    const result = evaluatePolicy([finding], policy);
    const httpAction = result.actions.find(a => a.action === 'http_post');

    expect(httpAction?.payload).toEqual({
      finding: { name: 'XSS Attack', sev: 'critical' },
    });
  });

  it('leaves unresolved placeholders as empty string when finding field does not exist', () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'webhook-missing-field',
          when: { 'finding.severity': 'critical' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/notify',
              payload: { unknown: '{{finding.nonExistentField}}' },
            },
          ],
        },
      ],
    };

    const finding = makeFinding({ severity: 'critical' });
    const result = evaluatePolicy([finding], policy);
    const httpAction = result.actions.find(a => a.action === 'http_post');

    expect(httpAction?.payload).toEqual({ unknown: '' });
  });

  it('preserves non-string payload values without modification', () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'webhook-types',
          when: { 'finding.severity': 'critical' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/notify',
              payload: { count: 42, active: true, tags: ['security', 'critical'] },
            },
          ],
        },
      ],
    };

    const finding = makeFinding({ severity: 'critical' });
    const result = evaluatePolicy([finding], policy);
    const httpAction = result.actions.find(a => a.action === 'http_post');

    expect(httpAction?.payload).toEqual({ count: 42, active: true, tags: ['security', 'critical'] });
  });
});

// ---------------------------------------------------------------------------
// 4. executeActions — calls fetch with correct URL, headers, and JSON body
// ---------------------------------------------------------------------------
describe('http_post — executeActions calls fetch correctly', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetch with the correct URL and method', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        url: 'https://hooks.example.com/notify',
        payload: { event: 'alert' },
      },
    ];

    await executeActions(actions, { runId: 'run-123' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://hooks.example.com/notify');
  });

  it('calls fetch with Content-Type: application/json header', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        url: 'https://hooks.example.com/notify',
        payload: { event: 'alert' },
      },
    ];

    await executeActions(actions, { runId: 'run-123' });

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe('POST');
    expect(((init as RequestInit).headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('calls fetch with custom headers merged alongside Content-Type', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        url: 'https://hooks.example.com/notify',
        payload: { event: 'alert' },
        headers: { 'X-Api-Key': 'my-secret', 'X-Source': 'forja' },
      },
    ];

    await executeActions(actions, { runId: 'run-abc' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Api-Key']).toBe('my-secret');
    expect(headers['X-Source']).toBe('forja');
  });

  it('sends the payload serialized as JSON body', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        url: 'https://hooks.example.com/notify',
        payload: { title: 'SQL Injection', severity: 'critical' },
      },
    ];

    await executeActions(actions, { runId: 'run-xyz' });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ title: 'SQL Injection', severity: 'critical' });
  });

  it('sends an empty JSON object body when payload is undefined', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        url: 'https://hooks.example.com/minimal',
      },
    ];

    await executeActions(actions, { runId: 'run-000' });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({});
  });

  it('interpolates {{runId}} in headers using the ActionContext runId', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        url: 'https://hooks.example.com/notify',
        headers: { 'X-Run-Id': '{{runId}}' },
      },
    ];

    await executeActions(actions, { runId: 'run-42' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Run-Id']).toBe('run-42');
  });
});

// ---------------------------------------------------------------------------
// 5. executeActions — skips gracefully with console.warn when url is missing
// ---------------------------------------------------------------------------
describe('http_post — executeActions skips when url is missing', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let warnSpy: any;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse());
    vi.stubGlobal('fetch', fetchMock);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });

  it('does not call fetch when url is missing', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        // url intentionally omitted
        payload: { event: 'alert' },
      },
    ];

    await executeActions(actions, { runId: 'run-no-url' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emits a console.warn with descriptive message when url is missing', async () => {
    const actions = [
      {
        action: 'http_post' as const,
        payload: { event: 'alert' },
      },
    ];

    await executeActions(actions, { runId: 'run-no-url' });

    expect(warnSpy).toHaveBeenCalledOnce();
    const [warnMsg] = warnSpy.mock.calls[0];
    expect(warnMsg).toContain('http_post');
    expect(warnMsg).toContain('url');
  });

  it('continues executing other actions after skipping the url-less http_post', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const actions = [
      { action: 'http_post' as const },
      { action: 'log' as const, message: 'still running' },
    ];

    await executeActions(actions, { runId: 'run-mixed' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('still running'));

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 6. Full pipeline integration — YAML → parse → evaluate → execute
// ---------------------------------------------------------------------------
describe('http_post — full pipeline integration', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeOkResponse());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses policy, evaluates finding, and executes http_post in one pipeline', async () => {
    const raw = {
      version: '1',
      policies: [
        {
          name: 'webhook-critical',
          when: { 'finding.severity': 'critical' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/critical',
              payload: {
                event: 'critical_finding',
                title: '{{finding.title}}',
                category: '{{finding.category}}',
              },
              headers: { 'X-Api-Key': 'pipeline-token' },
            },
          ],
        },
      ],
    };

    const policy = PolicyFileSchema.parse(raw);
    const finding = makeFinding({ severity: 'critical', title: 'RCE via Deserialization', category: 'injection' });
    const evalResult = evaluatePolicy([finding], policy);

    expect(evalResult.decision).toBe('pass'); // no gate actions in this policy
    expect(evalResult.actions).toHaveLength(1);

    await executeActions(evalResult.actions, { runId: 'pipeline-run-001' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://hooks.example.com/critical');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      event: 'critical_finding',
      title: 'RCE via Deserialization',
      category: 'injection',
    });

    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Api-Key']).toBe('pipeline-token');
  });

  it('evaluates multiple findings and fires http_post for each matching one', async () => {
    const policy: PolicyFile = {
      version: '1',
      policies: [
        {
          name: 'webhook-critical',
          when: { 'finding.severity': 'critical' },
          then: [
            {
              action: 'http_post',
              url: 'https://hooks.example.com/alert',
              payload: { title: '{{finding.title}}' },
            },
          ],
        },
      ],
    };

    const findings = [
      makeFinding({ severity: 'critical', title: 'Finding A' }),
      makeFinding({ severity: 'low',      title: 'Finding B' }),
      makeFinding({ severity: 'critical', title: 'Finding C' }),
    ];

    const evalResult = evaluatePolicy(findings, policy);
    expect(evalResult.actions).toHaveLength(2);

    await executeActions(evalResult.actions, { runId: 'multi-run' });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const bodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse((init as RequestInit).body as string)
    );
    expect(bodies).toContainEqual({ title: 'Finding A' });
    expect(bodies).toContainEqual({ title: 'Finding C' });
  });
});
