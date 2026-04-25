import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'resume',
  description: 'Resume a previously interrupted run by its ID',
  usage: 'forja resume <run-id>',
  examples: [
    { cmd: 'forja resume abc123', description: 'Resume the interrupted run abc123 from where it stopped' },
  ],
  flags: [],
});
