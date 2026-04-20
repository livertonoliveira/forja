import { randomUUID } from 'crypto';
import { CostEventSchema, CostEvent } from '../schemas/index.js';
import { TraceWriter } from '../trace/writer.js';
import { DualWriter } from '../trace/dual-writer.js';
import { CostAccumulator } from '../cost/accumulator.js';
import { loadConfig } from '../config/loader.js';
import type { ForjaStore } from '../store/interface.js';
import { UUID_RE } from './utils.js';
import { redactObject } from './redaction.js';

const PRICE_PER_MTOK: Record<string, { in: number; cacheWrite: number; cacheRead: number; out: number }> = {
  'claude-opus-4-7':   { in: 15,  cacheWrite: 18.75, cacheRead: 1.50, out: 75 },
  'claude-sonnet-4-6': { in: 3,   cacheWrite: 3.75,  cacheRead: 0.30, out: 15 },
  'claude-haiku-4-5':  { in: 0.8, cacheWrite: 1.00,  cacheRead: 0.08, out: 4  },
};

function calcCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
): number {
  const p = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK['claude-sonnet-4-6'];
  return (tokensIn / 1_000_000) * p.in
    + (cacheCreationTokens / 1_000_000) * p.cacheWrite
    + (cacheReadTokens / 1_000_000) * p.cacheRead
    + (tokensOut / 1_000_000) * p.out;
}

function ensureUuid(value: string | undefined): string {
  return value && UUID_RE.test(value) ? value : randomUUID();
}

// Module-level singleton to avoid opening/closing a pool on every hook invocation.
let _store: ForjaStore | null = null;
let _storeDbUrl: string | null = null;

async function getStore(): Promise<ForjaStore | null> {
  const config = await loadConfig();
  // Only connect to the store when the URL was explicitly configured by the user,
  // not when falling back to the compile-time default.
  if (config.source === 'default') return null;
  const dbUrl = config.storeUrl;
  if (!dbUrl) return null;
  if (_store && _storeDbUrl === dbUrl) return _store;
  // Dynamic import avoids loading pg/drizzle-orm on every hook spawn when DB is not configured.
  const { createStore } = await import('../store/index.js');
  _store = createStore(dbUrl, { max: 1, idleTimeoutMillis: 0 });
  _storeDbUrl = dbUrl;
  return _store;
}

export async function handlePostToolUse(payload: unknown): Promise<void> {
  const redacted = redactObject(payload);
  if (typeof redacted !== 'object' || redacted === null || Array.isArray(redacted)) {
    process.stderr.write('[forja] post-tool-use: unexpected payload shape after redaction, skipping\n');
    return;
  }
  const raw = redacted as Record<string, unknown>;
  const usage = raw?.usage as Record<string, unknown> | undefined;

  if (!usage || typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') {
    process.stderr.write('[forja] post-tool-use: missing or invalid usage field, skipping cost event\n');
    return;
  }

  const runId = process.env.FORJA_RUN_ID;
  if (!runId || !UUID_RE.test(runId)) {
    process.stderr.write('[forja] post-tool-use: FORJA_RUN_ID is missing or not a UUID, skipping\n');
    return;
  }

  const phase = process.env.FORJA_PHASE ?? 'unknown';
  const phaseId = ensureUuid(process.env.FORJA_PHASE_ID);
  const agentId = ensureUuid(process.env.FORJA_AGENT_ID);
  const spanId = process.env.FORJA_SPAN_ID;
  const model = (process.env.FORJA_MODEL ?? 'claude-sonnet-4-6') as string;

  const tokensIn = usage.input_tokens as number;
  const tokensOut = usage.output_tokens as number;
  const cacheCreationTokens = typeof usage.cache_creation_input_tokens === 'number'
    ? usage.cache_creation_input_tokens
    : 0;
  const cacheReadTokens = typeof usage.cache_read_input_tokens === 'number'
    ? usage.cache_read_input_tokens
    : 0;
  const costUsd = calcCostUsd(model, tokensIn, tokensOut, cacheCreationTokens, cacheReadTokens);

  const event: CostEvent = CostEventSchema.parse({
    id: randomUUID(),
    runId,
    phaseId,
    agentId,
    spanId,
    model,
    tokensIn,
    tokensOut,
    cacheCreationTokens,
    cacheReadTokens,
    costUsd,
    createdAt: new Date().toISOString(),
  });

  const writer = new TraceWriter(runId);
  const accumulator = new CostAccumulator();

  const store = await getStore();
  const dualWriter = store ? new DualWriter(writer, store, runId) : null;

  await Promise.allSettled([
    dualWriter
      ? dualWriter.writeCostEvent(event)
      : writer.write({
          runId,
          eventType: 'cost',
          phaseId,
          agentId,
          spanId,
          payload: { costEventId: event.id, phase, model, tokensIn, tokensOut, costUsd },
        }),
    accumulator.record(event),
  ]);
}
