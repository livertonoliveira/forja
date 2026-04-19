import { Command } from 'commander';
import { createStoreFromConfig } from '../../store/factory.js';
import { PipelineFSM, InvalidTransitionError, type PipelineState } from '../../engine/fsm.js';
import { CheckpointManager } from '../../engine/checkpoint.js';
import { PhaseIdempotencyGuard, cleanPhaseData } from '../../engine/idempotency.js';
import { DualWriter } from '../../trace/dual-writer.js';
import { TraceWriter } from '../../trace/writer.js';

// spec and quality phases (perf, security, review) are driven by external agents
export const PIPELINE_SEQUENCE: PipelineState[] = ['dev', 'test', 'homolog', 'pr', 'done'];

export const runCommand = new Command('run')
  .description('Run a Linear issue through the full pipeline')
  .argument('<issue-id>', 'Issue ID to run through the pipeline')
  .option('--model <model>', 'Model to use')
  .option('--dry-run', 'Dry run mode')
  .option('--force', 'Re-run all phases regardless of existing checkpoints')
  .option('--force-phase <phase>', 'Re-run a specific phase, clearing its previous data')
  .action(async (issueId: string, options: { model?: string; dryRun?: boolean; force?: boolean; forcePhase?: string }) => {
    const store = await createStoreFromConfig();

    const run = await store.createRun({
      issueId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'init',
      gitBranch: null,
      gitSha: null,
      model: options.model ?? null,
      totalCost: '0',
      totalTokens: 0,
    });

    console.log(`[forja] run ${run.id} started for issue ${issueId}`);

    const fsm = new PipelineFSM(store, run.id);
    const traceWriter = new TraceWriter(run.id);
    const dualWriter = new DualWriter(traceWriter, store, run.id);
    const checkpointManager = new CheckpointManager(store, run.id);
    const guard = new PhaseIdempotencyGuard(checkpointManager);

    if (options.forcePhase) {
      await cleanPhaseData(store, run.id, options.forcePhase as PipelineState, checkpointManager);
      console.log(`[forja] cleared data for phase '${options.forcePhase}'`);
    }

    try {
      for (const phase of PIPELINE_SEQUENCE) {
        const forceThis = options.force || options.forcePhase === phase;
        if (!(await guard.shouldRun(phase, { force: forceThis }))) {
          continue;
        }

        await dualWriter.writePhaseStart(phase);
        await fsm.transition(phase);
        console.log(`[forja] → ${phase}`);

        await dualWriter.writePhaseEnd(phase, 'success');
        await dualWriter.writeCheckpoint(phase);

        // Retrieve the phaseId from DualWriter's in-memory map (avoids a redundant listPhases call)
        const phaseId = dualWriter.getPhaseId(phase);
        if (phaseId) {
          await checkpointManager.save(phase, phaseId);
        }

        if (options.dryRun) break;
      }
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        console.error(`[forja] ${err.message}`);
        process.exitCode = 1;
      } else {
        throw err;
      }
    } finally {
      await store.close();
    }
  });
