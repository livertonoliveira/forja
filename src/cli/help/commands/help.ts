import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'help',
  description: 'Show help for a command, or list all available commands',
  usage: 'forja help [cmd]',
  examples: [
    { cmd: 'forja help', description: 'List all available commands with one-line descriptions' },
    { cmd: 'forja help run', description: 'Show detailed help for the run command' },
    { cmd: 'forja help gate', description: 'Show usage, flags, and examples for the gate command' },
  ],
  flags: [],
});
