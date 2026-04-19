import { Command } from 'commander';
import { createStoreFromConfig } from '../../store/factory.js';
import { PipelineFSM, InvalidTransitionError, type PipelineState } from '../../engine/fsm.js';

// spec and quality phases (perf, security, review) are driven by external agents
const PIPELINE_SEQUENCE: PipelineState[] = ['dev', 'test', 'homolog', 'pr', 'done'];

export const runCommand = new Command('run')
  .description('Run a Linear issue through the full pipeline')
  .argument('<issue-id>', 'Issue ID to run through the pipeline')
  .option('--model <model>', 'Model to use')
  .option('--dry-run', 'Dry run mode')
  .action(async (issueId: string, options: { model?: string; dryRun?: boolean }) => {
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

    try {
      for (const phase of PIPELINE_SEQUENCE) {
        await fsm.transition(phase);
        console.log(`[forja] → ${phase}`);
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
