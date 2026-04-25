import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'plugins',
  description: 'Manage Forja plugins',
  usage: 'forja plugins <subcommand>',
  examples: [
    { cmd: 'forja plugins list', description: 'List all registered plugins with version and source' },
    { cmd: 'forja plugins list --json', description: 'List plugins as JSON for scripting' },
    { cmd: 'forja plugins list --invalid', description: 'Show only plugins that failed validation' },
  ],
  flags: [
    { name: '--json', type: 'boolean', description: 'Output plugin list as JSON (use with "list" subcommand)' },
    { name: '--invalid', type: 'boolean', description: 'Show only plugins that failed validation (use with "list" subcommand)' },
  ],
});
