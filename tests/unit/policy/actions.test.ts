/**
 * Unit tests for MOB-1004 — `executeActions` in src/policy/actions.ts.
 *
 * Tests cover:
 *   - `log` action prints to stdout via console.log (with ANSI/newline stripping)
 *   - `http_post` and `notify_slack` are silently no-op (evaluator.ts already warns)
 *   - `fail_gate`, `warn_gate`, `pass_gate` are silently ignored
 *   - Empty action list resolves without side effects
 *   - Mixed action list processes each action correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeActions } from '../../../src/policy/actions.js';
import type { ActionContext } from '../../../src/policy/actions.js';
import type { PolicyAction } from '../../../src/policy/parser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(runId = '00000000-0000-0000-0000-000000000001'): ActionContext {
  return { runId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeActions — log action', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('calls console.log with [forja] policy: prefix and the message', async () => {
    const actions: PolicyAction[] = [{ action: 'log', message: 'hello world' }];
    await executeActions(actions, makeContext());
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('[forja] policy: hello world');
  });

  it('prints empty string when message is undefined', async () => {
    const actions: PolicyAction[] = [{ action: 'log' }];
    await executeActions(actions, makeContext());
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('[forja] policy: ');
  });

  it('calls console.log once per log action in the list', async () => {
    const actions: PolicyAction[] = [
      { action: 'log', message: 'first' },
      { action: 'log', message: 'second' },
      { action: 'log', message: 'third' },
    ];
    await executeActions(actions, makeContext());
    expect(logSpy).toHaveBeenCalledTimes(3);
  });

  it('strips newline characters from message to prevent log injection', async () => {
    const actions: PolicyAction[] = [{ action: 'log', message: 'line1\nfake-log-entry' }];
    await executeActions(actions, makeContext());
    expect(logSpy).toHaveBeenCalledWith('[forja] policy: line1fake-log-entry');
  });

  it('strips ANSI escape sequences from message', async () => {
    const actions: PolicyAction[] = [{ action: 'log', message: 'safe\x1b[31mred\x1b[0m' }];
    await executeActions(actions, makeContext());
    expect(logSpy).toHaveBeenCalledWith('[forja] policy: safered');
  });
});

describe('executeActions — http_post action', () => {
  it('resolves without calling console.warn (evaluator.ts handles the warning)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const actions: PolicyAction[] = [{ action: 'http_post', url: 'https://example.com' }];
    await expect(executeActions(actions, makeContext())).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not throw when http_post action has no url', async () => {
    const actions: PolicyAction[] = [{ action: 'http_post' }];
    await expect(executeActions(actions, makeContext())).resolves.toBeUndefined();
  });
});

describe('executeActions — notify_slack action', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.FORJA_SLACK_WEBHOOK_URL;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    delete process.env.FORJA_SLACK_WEBHOOK_URL;
  });

  it('warns and skips when FORJA_SLACK_WEBHOOK_URL is not set', async () => {
    const actions: PolicyAction[] = [{ action: 'notify_slack', message: 'alert!' }];
    await expect(executeActions(actions, makeContext())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[forja] FORJA_SLACK_WEBHOOK_URL not set — Slack notification skipped');
  });

  it('does not throw when notify_slack action has no message and no URL set', async () => {
    const actions: PolicyAction[] = [{ action: 'notify_slack' }];
    await expect(executeActions(actions, makeContext())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[forja] FORJA_SLACK_WEBHOOK_URL not set — Slack notification skipped');
  });

  it('calls fetch with interpolated message when FORJA_SLACK_WEBHOOK_URL is set', async () => {
    process.env.FORJA_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const ctx = makeContext('aaaaaaaa-0000-0000-0000-000000000001');
    const actions: PolicyAction[] = [{ action: 'notify_slack', channel: '#alerts', message: 'run {{runId}}' }];
    await executeActions(actions, ctx);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://hooks.slack.com/test');
    expect(JSON.parse(init.body as string)).toMatchObject({
      channel: '#alerts',
      text: 'run aaaaaaaa-0000-0000-0000-000000000001',
    });
    fetchSpy.mockRestore();
  });

  it('warns and skips when webhook URL is not https://', async () => {
    process.env.FORJA_SLACK_WEBHOOK_URL = 'http://hooks.slack.com/test';
    const actions: PolicyAction[] = [{ action: 'notify_slack', message: 'alert' }];
    await expect(executeActions(actions, makeContext())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[forja] FORJA_SLACK_WEBHOOK_URL must be an https:// URL — Slack notification skipped');
  });

  it('warns but does not throw when fetch rejects', async () => {
    process.env.FORJA_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const actions: PolicyAction[] = [{ action: 'notify_slack', message: 'alert' }];
    await expect(executeActions(actions, makeContext())).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('[forja] Slack notification failed: network error');
    fetchSpy.mockRestore();
  });

  it('sends only one notification per channel even with multiple critical findings', async () => {
    process.env.FORJA_SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const actions: PolicyAction[] = [
      { action: 'notify_slack', channel: '#eng-alerts', message: 'finding 1' },
      { action: 'notify_slack', channel: '#eng-alerts', message: 'finding 2' },
      { action: 'notify_slack', channel: '#eng-alerts', message: 'finding 3' },
    ];
    await executeActions(actions, makeContext());
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });
});

describe('executeActions — decision actions (fail_gate, warn_gate, pass_gate)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('does not call console.log or console.warn for fail_gate', async () => {
    const actions: PolicyAction[] = [{ action: 'fail_gate' }];
    await executeActions(actions, makeContext());
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not call console.log or console.warn for warn_gate', async () => {
    const actions: PolicyAction[] = [{ action: 'warn_gate' }];
    await executeActions(actions, makeContext());
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not call console.log or console.warn for pass_gate', async () => {
    const actions: PolicyAction[] = [{ action: 'pass_gate' }];
    await executeActions(actions, makeContext());
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('resolves without error for fail_gate', async () => {
    await expect(executeActions([{ action: 'fail_gate' }], makeContext())).resolves.toBeUndefined();
  });

  it('resolves without error for warn_gate', async () => {
    await expect(executeActions([{ action: 'warn_gate' }], makeContext())).resolves.toBeUndefined();
  });

  it('resolves without error for pass_gate', async () => {
    await expect(executeActions([{ action: 'pass_gate' }], makeContext())).resolves.toBeUndefined();
  });
});

describe('executeActions — empty action list', () => {
  it('resolves without any side effects when given an empty array', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(executeActions([], makeContext())).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('executeActions — mixed action list', () => {
  it('processes each action: log fires, http_post and fail_gate are silent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const actions: PolicyAction[] = [
      { action: 'log', message: 'Found a critical issue' },
      { action: 'fail_gate' },
      { action: 'http_post', url: 'https://webhook.example.com' },
    ];

    await executeActions(actions, makeContext());

    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('[forja] policy: Found a critical issue');
    expect(warnSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('logs multiple messages; notify_slack warns when no URL, http_post is silent', async () => {
    delete process.env.FORJA_SLACK_WEBHOOK_URL;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const actions: PolicyAction[] = [
      { action: 'log', message: 'message 1' },
      { action: 'notify_slack' },
      { action: 'log', message: 'message 2' },
      { action: 'http_post' },
      { action: 'warn_gate' },
    ];

    await executeActions(actions, makeContext());

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith('[forja] FORJA_SLACK_WEBHOOK_URL not set — Slack notification skipped');

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

describe('executeActions — ActionContext', () => {
  it('accepts any valid runId UUID without throwing', async () => {
    const ctx: ActionContext = { runId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' };
    await expect(executeActions([], ctx)).resolves.toBeUndefined();
  });
});
