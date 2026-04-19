import { Command } from 'commander';
import { createStoreFromConfig } from '../../store/factory.js';
import { PipelineFSM } from '../../engine/fsm.js';
import { CheckpointManager } from '../../engine/checkpoint.js';
import { PIPELINE_SEQUENCE } from './run.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const resumeCommand = new Command('resume')
  .description('Resume a previously interrupted run by its ID')
  .argument('<run-id>', 'ID of the run to resume')
  .action(async (runId: string) => {
    // Validate runId before any path construction or DB access
    if (!UUID_RE.test(runId)) {
      console.error('[forja] resume: invalid run ID format:', runId);
      process.exit(1);
    }

    const store = await createStoreFromConfig();
    try {
      // Validate run exists BEFORE looking up checkpoint
      const run = await store.getRun(runId);
      if (!run) {
        console.error('[forja] resume: run not found:', runId);
        process.exit(1);
      }

      // Handle failed FSM state explicitly
      if (run.status === 'failed') {
        console.error(
          `[forja] resume: run ${runId} is in 'failed' state.`,
          'Fix the underlying issue and re-run from the appropriate phase.',
        );
        process.exit(1);
      }

      const checkpointManager = new CheckpointManager(store, runId);
      const checkpoint = await checkpointManager.getLastCompleted();

      if (!checkpoint) {
        console.error('[forja] resume: no checkpoint found — cannot resume run', runId);
        process.exit(1);
      }

      console.log(`[forja] resuming from phase: ${checkpoint.phase}`);

      const fsm = new PipelineFSM(store, runId);
      const lastIndex = PIPELINE_SEQUENCE.indexOf(checkpoint.phase);
      const remainingPhases = lastIndex >= 0 ? PIPELINE_SEQUENCE.slice(lastIndex + 1) : PIPELINE_SEQUENCE;

      if (remainingPhases.length === 0) {
        console.log('[forja] resume: all phases already completed — nothing to resume');
        return;
      }

      console.log(`[forja] phases already completed: ${PIPELINE_SEQUENCE.slice(0, lastIndex + 1).join(', ')}`);
      console.log(`[forja] next phase to execute: ${remainingPhases[0]}`);
      console.log(`[forja] remaining phases: ${remainingPhases.join(', ')}`);
      console.log(`[forja] run forja run ${run.issueId} to continue from this checkpoint`);

      // Verify FSM can transition to the next phase
      const canTransition = await fsm.canTransition(remainingPhases[0]);
      if (!canTransition) {
        const currentState = await fsm.getState();
        console.warn(`[forja] warning: FSM is in state '${currentState}' — transition to '${remainingPhases[0]}' may not be valid`);
      }
    } catch (err) {
      console.error(`[forja] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    } finally {
      await store.close().catch(() => {});
    }
  });
