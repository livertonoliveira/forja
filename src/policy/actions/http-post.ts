import type { ActionContext } from '../actions.js';
import { deepMapStrings } from '../deep-map-strings.js';

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

async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
  const safe = maskUrl(url);
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise<void>(r => setTimeout(r, 1000));
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      console.warn(`[forja] Webhook POST attempt ${attempt + 1} to ${safe} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw lastError;
}

export async function httpPost(options: {
  url: string;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
  context: ActionContext;
}): Promise<void> {
  if (!validateWebhookUrl(options.url)) {
    console.warn(`[forja] http_post: url must be a valid https:// URL — skipped (${maskUrl(options.url)})`);
    return;
  }

  const body = interpolateObject(options.payload ?? {}, options.context);
  const customHeaders: Record<string, string> = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([k, v]) => [k, interpolateValue(v, options.context)])
  );

  try {
    const response = await fetchWithRetry(options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...customHeaders },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(`[forja] Webhook POST to ${maskUrl(options.url)} failed: ${response.status}`);
    }
  } catch (err) {
    console.warn(`[forja] Webhook POST to ${maskUrl(options.url)} failed after retries: ${err instanceof Error ? err.message : String(err)}`);
  }
}
