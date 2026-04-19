import { Command } from 'commander';
import {
  scheduleCommand as createSchedule,
  listSchedules,
  deleteSchedule,
  getNextRun,
} from '../../scheduling/scheduler.js';

function formatNextRun(cronExpr: string): string {
  try {
    const next = getNextRun(cronExpr);
    return next.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return 'N/A';
  }
}

export const scheduleCommand = new Command('schedule')
  .description('Manage scheduled pipeline tasks')
  .argument('<command>', 'list | delete | <command-to-schedule>')
  .argument('[id]', 'schedule ID (required for delete)')
  .option('--cron <expr>', 'cron expression (required when creating a schedule)')
  .action(async (command: string, id: string | undefined, options: { cron?: string }) => {
    if (command === 'list') {
      const schedules = await listSchedules();
      if (schedules.length === 0) {
        console.log('[forja] No active schedules.');
        return;
      }
      const header = 'ID            Command          Cron              Next Run';
      console.log(header);
      console.log('-'.repeat(header.length));
      for (const s of schedules) {
        const nextRun = formatNextRun(s.cron);
        console.log(`${s.id.padEnd(13)} ${s.command.padEnd(16)} ${s.cron.padEnd(17)} ${nextRun}`);
      }
      return;
    }

    if (command === 'delete') {
      if (!id) {
        console.error('[forja] Error: provide the schedule ID. Ex: forja schedule delete sched-001');
        process.exit(1);
      }
      try {
        await deleteSchedule(id);
        console.log(`[forja] Schedule ${id} removed.`);
      } catch (err) {
        console.error(`[forja] ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      return;
    }

    if (!options.cron) {
      console.error('[forja] Error: --cron is required. Ex: --cron "0 2 * * 1"');
      process.exit(1);
    }

    try {
      const schedId = await createSchedule(command, options.cron);
      const nextRun = formatNextRun(options.cron);
      console.log(`[forja] Schedule created: ${schedId}`);
      console.log(`        Command:  ${command}`);
      console.log(`        Cron:     ${options.cron}`);
      console.log(`        Next run: ${nextRun}`);
    } catch (err) {
      console.error(`[forja] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
