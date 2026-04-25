import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'cost',
  description: 'Show cost analysis for a pipeline run',
  usage: 'forja cost [--run <run-id>]',
  examples: [
    { cmd: 'forja cost --run abc123', description: 'Show cost breakdown for run abc123' },
    { cmd: 'forja cost', description: 'Show cost for the most recent run' },
  ],
  flags: [
    { name: '--run <run-id>', type: 'string', description: 'Run ID to analyze' },
  ],
});
