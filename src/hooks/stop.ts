import { TraceWriter } from '../trace/writer.js';
import { UUID_RE, validateUuid } from './utils.js';

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

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

  const timedOut = checkPhaseTimeout();

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

function checkPhaseTimeout(): boolean {
  const timeoutAt = process.env.FORJA_PHASE_TIMEOUT_AT;
  if (!timeoutAt) return false;
  if (!ISO8601_RE.test(timeoutAt)) return false;
  const deadline = new Date(timeoutAt).getTime();
  if (isNaN(deadline)) return false;
  return Date.now() > deadline;
}
