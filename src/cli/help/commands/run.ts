import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'run',
  description: 'Run a Linear issue through the full pipeline',
  usage: 'forja run <issue-id> [options]',
  examples: [
    { cmd: 'forja run MOB-123', description: 'Run issue MOB-123 through the full pipeline' },
    { cmd: 'forja run MOB-123 --dry-run', description: 'Plan execution without running agents' },
    { cmd: 'forja run MOB-123 --force', description: 'Re-run all phases, ignoring checkpoints' },
    { cmd: 'forja run MOB-123 --force-phase dev', description: 'Re-run only the dev phase, clearing its data' },
    { cmd: 'forja run MOB-123 --timeout-phase dev:900', description: 'Override dev phase timeout to 900 seconds' },
  ],
  flags: [
    { name: '--model <model>', type: 'string', description: 'Model to use for AI operations' },
    { name: '--dry-run', type: 'boolean', description: 'Plan execution without running agents' },
    { name: '--force', type: 'boolean', description: 'Re-run all phases, ignoring checkpoints' },
    { name: '--force-phase <phase>', type: 'string', description: 'Re-run a specific phase, clearing its previous data' },
    { name: '--timeout-phase <phase:seconds>', type: 'string', description: 'Override timeout for a phase, e.g. dev:900' },
  ],
});
