import { randomUUID } from 'crypto';
import { CostEventSchema, CostEvent } from '../schemas/index.js';
import { TraceWriter } from '../trace/writer.js';
import { CostAccumulator } from '../cost/accumulator.js';

const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 0.8, out: 4 },
};

function calcCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const prices = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK['claude-sonnet-4-6'];
  return (tokensIn / 1_000_000) * prices.in + (tokensOut / 1_000_000) * prices.out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureUuid(value: string | undefined): string {
  return value && UUID_RE.test(value) ? value : randomUUID();
}

export async function handlePostToolUse(payload: unknown): Promise<void> {
  const raw = payload as Record<string, unknown>;
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
  const costUsd = calcCostUsd(model, tokensIn, tokensOut);

  const event: CostEvent = CostEventSchema.parse({
    id: randomUUID(),
    runId,
    phaseId,
    agentId,
    spanId,
    model,
    tokensIn,
    tokensOut,
    costUsd,
    createdAt: new Date().toISOString(),
  });

  const writer = new TraceWriter(runId);
  const accumulator = new CostAccumulator();

  await Promise.all([
    writer.write({
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
