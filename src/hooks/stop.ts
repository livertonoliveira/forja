import { TraceWriter } from '../trace/writer.js';
import { UUID_RE, validateUuid } from './utils.js';
import { isTimedOut } from '../engine/timeout.js';
import { createStoreFromConfig } from '../store/factory.js';
import { PipelineFSM } from '../engine/fsm.js';

export async function handleStop(payload: unknown): Promise<void> {
  const raw = payload as Record<string, unknown>;
  const stopReason = typeof raw?.stop_reason === 'string' ? raw.stop_reason : 'end_turn';
  const status: 'completed' | 'interrupted' = stopReason === 'interrupted' ? 'interrupted' : 'completed';

  const runId = process.env.FORJA_RUN_ID;
  if (!runId || !UUID_RE.test(runId)) {
    process.stderr.write('[forja] stop: FORJA_RUN_ID is missing or not a UUID, skipping\n');
    return;
  }

  const phase = process.env.FORJA_PHASE ?? 'unknown';
  const phaseId = validateUuid(process.env.FORJA_PHASE_ID);
  // agentId intentionally omitted: stop fires at session level, not per-agent
  const spanId = process.env.FORJA_SPAN_ID;

  const timedOut = isTimedOut();

  if (timedOut && phaseId) {
    const store = await createStoreFromConfig();
    try {
      await store.updatePhase(phaseId, { status: 'timeout', finishedAt: new Date().toISOString() });
      const fsm = new PipelineFSM(store, runId);
      try {
        await fsm.transition('failed');
      } catch (err) {
        process.stderr.write(`[forja] stop: could not transition FSM to failed: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    } finally {
      await store.close();
    }
  }

  const writer = new TraceWriter(runId);
  await writer.write({
    runId,
    eventType: 'run_end',
    phaseId,
    spanId,
    payload: {
      status: timedOut ? 'interrupted' : status,
      phase,
      stopReason,
      ...(timedOut ? { timedOut: true } : {}),
    },
  });
}
