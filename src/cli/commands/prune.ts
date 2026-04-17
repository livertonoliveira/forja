import { Command } from 'commander';

export const pruneCommand = new Command('prune')
  .description('Remove old runs and artifacts from local storage')
  .option('--before <date>', 'delete runs created before this ISO date')
  .option('--dry-run', 'show what would be deleted without removing anything')
  .action(() => {
    console.log('[forja] prune — ainda não implementado');
  });
