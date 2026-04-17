import { Command } from 'commander';

export const gateCommand = new Command('gate')
  .description('Evaluate quality gates for a pipeline run')
  .requiredOption('--run <run-id>', 'Run ID to evaluate')
  .option('--policy <policy>', 'Policy to apply')
  .action((_opts, cmd) => {
    const { run, policy } = cmd.opts() as { run: string; policy?: string };
    const policyPart = policy ? ` --policy ${policy}` : '';
    console.log(`[forja] gate --run ${run}${policyPart} — ainda não implementado`);
  });
