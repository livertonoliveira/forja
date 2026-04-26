export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfterHeader: string | null = null
  ) {
    super(`HTTP ${status}`);
  }
}

export interface RetryConfig {
  maxRetries: number;  // default: 5
  baseDelayMs: number; // default: 500
  maxDelayMs: number;  // default: 30_000
  jitter: boolean;     // default: true
}

const defaults: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: true,
};

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calcBackoff(attempt: number, config: RetryConfig): number {
  const exp = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
  return config.jitter ? exp * (0.5 + Math.random() * 0.5) : exp;
}

function isNonRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status >= 400 && err.status < 500 && err.status !== 429;
  }
  return false;
}

function getRetryAfterMs(err: unknown): number | null {
  if (err instanceof HttpError && err.status === 429 && err.retryAfterHeader !== null) {
    const seconds = parseFloat(err.retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return null;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = defaults,
  onExhausted: (error: Error) => Promise<void>,
  hookType?: string
): Promise<T | void> {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (isNonRetryable(err)) {
        await onExhausted(error);
        return;
      }

      if (attempt === config.maxRetries) {
        await onExhausted(error);
        return;
      }

      const retryAfterMs = getRetryAfterMs(err);
      const delayMs = retryAfterMs !== null
        ? Math.min(retryAfterMs, config.maxDelayMs)
        : calcBackoff(attempt, config);
      const status = err instanceof HttpError ? err.status : undefined;

      console.log(
        `[forja] retry: attempt ${attempt + 1}/${config.maxRetries}${hookType !== undefined ? ` (${hookType})` : ''}` +
        `${status !== undefined ? `, status=${status}` : ''}, delayMs=${Math.round(delayMs)}`
      );

      await sleep(delayMs);
    }
  }
}
