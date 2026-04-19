import type { ActionContext } from '../actions.js';
import { loadConfig } from '../../config/loader.js';

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
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: options.channel, text }),
    });
    if (!res.ok) {
      console.warn(`[forja] Slack notification failed: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[forja] Slack notification failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
