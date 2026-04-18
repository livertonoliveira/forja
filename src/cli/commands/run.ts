import { Command } from 'commander';
import { createStoreFromConfig } from '../../store/factory.js';

export const runCommand = new Command('run')
  .description('Run a Linear issue through the full pipeline')
  .argument('<issue-id>', 'Issue ID to run through the pipeline')
  .option('--model <model>', 'Model to use')
  .option('--dry-run', 'Dry run mode')
  .action(async (issueId: string) => {
    const _store = await createStoreFromConfig();
    console.log('[forja] run ' + issueId + ' — ainda não implementado');
  });
