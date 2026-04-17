import { Command } from 'commander';

export const scheduleCommand = new Command('schedule')
  .description('Manage scheduled pipeline tasks')
  .argument('<command>', 'command to schedule')
  .requiredOption('--cron <expr>', 'cron expression for scheduling')
  .action(() => {
    console.log('[forja] schedule — ainda não implementado');
  });
