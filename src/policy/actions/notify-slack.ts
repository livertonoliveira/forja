import type { ActionContext } from '../actions.js';
import { loadConfig } from '../../config/loader.js';
import { DryRunInterceptor, DRY_RUN_ACTIONS } from '../../cli/middleware/dry-run.js';
import { withRetry, HttpError } from '../../hooks/retry.js';

function interpolate(template: string, context: ActionContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    if (k === 'runId') return context.runId;
    return '';
  });
}

function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function notifySlack(options: {
  channel: string;
  message: string;
  context: ActionContext;
}): Promise<void> {
  return DryRunInterceptor.intercept(DRY_RUN_ACTIONS.SLACK_NOTIFY, async () => {
    const webhookUrl = process.env.FORJA_SLACK_WEBHOOK_URL ?? (await loadConfig()).slackWebhookUrl;
    if (!webhookUrl) {
      console.warn('[forja] FORJA_SLACK_WEBHOOK_URL not set — Slack notification skipped');
      return;
    }
    if (!validateWebhookUrl(webhookUrl)) {
      console.warn('[forja] FORJA_SLACK_WEBHOOK_URL must be an https:// URL — Slack notification skipped');
      return;
    }
    const text = interpolate(options.message, options.context);
    await withRetry(
      async () => {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: options.channel, text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new HttpError(res.status, res.headers.get('Retry-After'));
      },
      undefined,
      async (err) => console.warn('[forja] Slack notification failed after retries:', err.message),
      'slack'
    );
  });
}
