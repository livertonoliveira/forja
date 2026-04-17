import { Command } from 'commander';

export const runCommand = new Command('run')
  .description('Run a Linear issue through the full pipeline')
  .argument('<issue-id>', 'Issue ID to run through the pipeline')
  .option('--model <model>', 'Model to use')
  .option('--dry-run', 'Dry run mode')
  .action((issueId: string) => {
    console.log('[forja] run ' + issueId + ' — ainda não implementado');
  });
