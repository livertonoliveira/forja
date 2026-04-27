import { TraceWriter } from '../trace/writer.js';
import { readActiveRun, clearActiveRun } from '../trace/active-run.js';
import { UUID_RE, validateUuid } from './utils.js';
import { isTimedOut } from '../engine/timeout.js';
import { createStoreFromConfig } from '../store/factory.js';
import { PipelineFSM } from '../engine/fsm.js';

export async function handleStop(payload: unknown): Promise<void> {
  const raw = payload as Record<string, unknown>;
  const stopReason = typeof raw?.stop_reason === 'string' ? raw.stop_reason : 'end_turn';
  const status: 'completed' | 'interrupted' = stopReason === 'interrupted' ? 'interrupted' : 'completed';

  let runId = process.env.FORJA_RUN_ID;
  let fromActiveRunFile = false;
  if (!runId || !UUID_RE.test(runId)) {
    const active = await readActiveRun();
    if (active) {
      runId = active.runId;
      fromActiveRunFile = true;
    } else {
      process.stderr.write('[forja] stop: FORJA_RUN_ID is missing and no active run found, skipping\n');
      return;
    }
  }

  const phase = process.env.FORJA_PHASE ?? 'unknown';
  const phaseId = validateUuid(process.env.FORJA_PHASE_ID);
  // agentId intentionally omitted: stop fires at session level, not per-agent
  const spanId = process.env.FORJA_SPAN_ID;

  const timedOut = isTimedOut();

  // FSM/store operations only apply when running under the CLI harness (FORJA_RUN_ID in env)
  if (!fromActiveRunFile && timedOut && phaseId) {
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

  if (fromActiveRunFile) {
    await clearActiveRun();
  }
}
