import { Command } from 'commander';

export const replayCommand = new Command('replay')
  .description('Replay a previous task execution by its run ID')
  .argument('<run-id>', 'ID of the run to replay')
  .action((_runId: string) => {
    console.log('[forja] replay — ainda não implementado');
  });
