import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'schedule',
  description: 'Manage scheduled pipeline tasks',
  usage: 'forja schedule <command> [id] [options]',
  examples: [
    { cmd: 'forja schedule list', description: 'List all scheduled tasks' },
    { cmd: 'forja schedule run --cron "0 9 * * 1"', description: 'Schedule a run command every Monday at 9am' },
    { cmd: 'forja schedule delete abc123', description: 'Delete the scheduled task with ID abc123' },
  ],
  flags: [
    { name: '--cron <expr>', type: 'string', description: 'Cron expression for the schedule (required when creating)' },
  ],
});
