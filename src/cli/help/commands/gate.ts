import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'gate',
  description: 'Evaluate quality gates for a pipeline run',
  usage: 'forja gate --run <run-id> [options]',
  examples: [
    { cmd: 'forja gate --run abc123', description: 'Evaluate gates for run abc123 with the default policy' },
    { cmd: 'forja gate --run abc123 --policy policies/strict.yaml', description: 'Evaluate gates with a custom policy file' },
  ],
  flags: [
    { name: '--run <run-id>', type: 'string', description: 'Run ID to evaluate (required)' },
    { name: '--policy <path>', type: 'string', default: 'policies/default.yaml', description: 'Path to policy YAML file' },
  ],
});
