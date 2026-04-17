import { Command } from 'commander';

export const resumeCommand = new Command('resume')
  .description('Resume a previously interrupted run by its ID')
  .argument('<run-id>', 'ID of the run to resume')
  .action((_runId: string) => {
    console.log('[forja] resume — ainda não implementado');
  });
