import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { gateCommand } from './commands/gate.js';
import { traceCommand } from './commands/trace.js';
import { costCommand } from './commands/cost.js';
import { resumeCommand } from './commands/resume.js';
import { pruneCommand } from './commands/prune.js';
import { uiCommand } from './commands/ui.js';
import { infraCommand } from './commands/infra.js';
import { configCommand } from './commands/config.js';
import { hookCommand } from './commands/hook.js';
import { scheduleCommand } from './commands/schedule.js';
import { replayCommand } from './commands/replay.js';
import { setupCommand } from './commands/setup.js';

declare const __FORJA_VERSION__: string;

const program = new Command();

program
  .name('forja')
  .description('Forja Harness Engine CLI')
  .version(__FORJA_VERSION__)
  .addCommand(runCommand)
  .addCommand(gateCommand)
  .addCommand(traceCommand)
  .addCommand(costCommand)
  .addCommand(resumeCommand)
  .addCommand(pruneCommand)
  .addCommand(uiCommand)
  .addCommand(infraCommand)
  .addCommand(configCommand)
  .addCommand(hookCommand)
  .addCommand(scheduleCommand)
  .addCommand(replayCommand)
  .addCommand(setupCommand);

program.parse();
