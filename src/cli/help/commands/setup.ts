import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'setup',
  description: 'Set up Forja in the current project (slash commands, hooks, optional harness)',
  usage: 'forja setup [options]',
  examples: [
    { cmd: 'forja setup', description: 'Set up Forja with Claude Code slash commands and hooks' },
    { cmd: 'forja setup --with-harness', description: 'Also set up PostgreSQL and run database migrations' },
    { cmd: 'forja setup --skip-claude-md', description: 'Skip appending the Forja section to CLAUDE.md' },
  ],
  flags: [
    { name: '--with-harness', type: 'boolean', description: 'Also set up PostgreSQL and run database migrations' },
    { name: '--skip-claude-md', type: 'boolean', description: 'Do not append Forja section to CLAUDE.md' },
  ],
});
