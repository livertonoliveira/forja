import { randomUUID } from 'crypto';
import { generateSpanId } from '../trace/span.js';
import { TraceWriter } from '../trace/writer.js';

export interface SpawnContext {
  spanId: string;
  agentId: string;
  env: Record<string, string>;
}

export async function spawnAgent(params: {
  runId: string;
  phase: string;
  phaseId?: string;
}): Promise<SpawnContext> {
  const spanId = generateSpanId();
  const agentId = randomUUID();

  const writer = new TraceWriter(params.runId);
  await writer.write({
    runId: params.runId,
    eventType: 'agent_start',
    spanId,
    agentId,
    phaseId: params.phaseId,
    payload: { phase: params.phase },
  });

  return {
    spanId,
    agentId,
    env: {
      FORJA_SPAN_ID: spanId,
      FORJA_AGENT_ID: agentId,
    },
  };
}
