import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'prune',
  description: 'Remove old runs and artifacts from local storage',
  usage: 'forja prune [options]',
  examples: [
    { cmd: 'forja prune --before 2024-01-01', description: 'Delete runs created before Jan 1st 2024' },
    { cmd: 'forja prune --dry-run', description: 'Preview what would be deleted without removing anything' },
    { cmd: 'forja prune --before 2024-06-01 --dry-run', description: 'Preview deletions before a specific date' },
  ],
  flags: [
    { name: '--before <date>', type: 'string', description: 'Delete runs created before this ISO date' },
    { name: '--dry-run', type: 'boolean', description: 'Show what would be deleted without removing anything' },
  ],
});
