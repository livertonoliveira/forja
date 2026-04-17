import { Command } from 'commander';

export const costCommand = new Command('cost')
  .description('Show cost analysis for a pipeline run')
  .option('--run <run-id>', 'Run ID to analyze')
  .action(() => {
    console.log('[forja] cost — ainda não implementado');
  });
