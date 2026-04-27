import { Command, Help } from 'commander';
import { DryRunInterceptor } from './middleware/dry-run.js';
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
import { pluginsCommand } from './commands/plugins.js';
import { policiesCommand } from './commands/policies.js';
import { migrateCommand } from './commands/migrate.js';
import { helpCommand } from './commands/help.js';
import { completionCommand } from './commands/completion.js';
import { doctorCommand } from './commands/doctor.js';
import { commandRegistry } from './help/command-registry.js';
import { formatCommandHelp } from './format.js';

declare const __FORJA_VERSION__: string;

const program = new Command();

program.configureHelp({
  formatHelp(cmd: Command, helper: Help): string {
    const entry = commandRegistry.get(cmd.name());
    if (entry) return formatCommandHelp(entry);
    return Help.prototype.formatHelp.call(helper, cmd, helper);
  },
});

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
  .addCommand(setupCommand)
  .addCommand(pluginsCommand)
  .addCommand(policiesCommand)
  .addCommand(migrateCommand)
  .addCommand(helpCommand)
  .addCommand(completionCommand)
  .addCommand(doctorCommand);

program.option('-n, --dry-run', 'Simula execução sem efeitos colaterais');
program.hook('preAction', (thisCommand) => {
  if (thisCommand.opts().dryRun) DryRunInterceptor.enable();
});
program.hook('postAction', () => {
  DryRunInterceptor.reset();
});

program.parse();
