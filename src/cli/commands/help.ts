import { Command } from 'commander';
import { commandRegistry } from '../help/index.js';
import { formatCommandHelp, formatCommandList } from '../format.js';

export const helpCommand = new Command('help')
  .description('Show help for a command, or list all commands')
  .argument('[cmd]', 'Command name to show help for')
  .action((cmd?: string) => {
    if (!cmd) {
      process.stdout.write(formatCommandList(commandRegistry));
    } else {
      const entry = commandRegistry.get(cmd);
      if (!entry) {
        process.stderr.write(`Unknown command: ${cmd}\n`);
        process.stderr.write(`Run "forja help" to see all available commands.\n`);
        process.exit(1);
      }
      process.stdout.write(formatCommandHelp(entry));
    }
  });
