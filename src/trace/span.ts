import { AsyncLocalStorage } from 'async_hooks';
import { nanoid } from 'nanoid';

const spanStorage = new AsyncLocalStorage<string>();

export function generateSpanId(): string {
  return nanoid(16);
}

// In-process: reads from AsyncLocalStorage. In a sub-process: falls back to FORJA_SPAN_ID env var set by parent.
export function currentSpanId(): string | undefined {
  return spanStorage.getStore() ?? process.env.FORJA_SPAN_ID;
}

export async function withSpan<T>(spanId: string, fn: () => Promise<T>): Promise<T> {
  return spanStorage.run(spanId, fn);
}
