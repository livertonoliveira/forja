import type { ActionContext } from '../actions.js';
import { deepMapStrings } from '../deep-map-strings.js';
import { DryRunInterceptor, DRY_RUN_ACTIONS } from '../../cli/middleware/dry-run.js';
import { withRetry, HttpError } from '../../hooks/retry.js';

function validateWebhookUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    return parsed.search ? `${base}?<redacted>` : base;
  } catch {
    return '<invalid-url>';
  }
}

function interpolateValue(value: string, context: ActionContext): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const k = key.trim();
    if (k === 'runId') return context.runId;
    return process.env[k] ?? '';
  });
}

export function interpolateObject(obj: Record<string, unknown>, context: ActionContext): Record<string, unknown> {
  return deepMapStrings(obj, v => interpolateValue(v, context));
}

export async function httpPost(options: {
  url: string;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
  context: ActionContext;
}): Promise<void> {
  return DryRunInterceptor.intercept(DRY_RUN_ACTIONS.WEBHOOK_HTTP_POST, async () => {
    if (!validateWebhookUrl(options.url)) {
      console.warn(`[forja] http_post: url must be a valid https:// URL — skipped (${maskUrl(options.url)})`);
      return;
    }

    const body = interpolateObject(options.payload ?? {}, options.context);
    const customHeaders: Record<string, string> = Object.fromEntries(
      Object.entries(options.headers ?? {}).map(([k, v]) => [k, interpolateValue(v, options.context)])
    );

    await withRetry(
      async () => {
        const response = await fetch(options.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...customHeaders },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new HttpError(response.status, response.headers.get('Retry-After'));
      },
      undefined,
      async (err) => console.warn('[forja] Webhook POST failed after retries:', err.message),
      'http-post'
    );
  });
}
