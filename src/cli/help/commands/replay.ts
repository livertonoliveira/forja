import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'replay',
  description: 'Replay a previous task execution by its run ID',
  usage: 'forja replay <run-id> [options]',
  examples: [
    { cmd: 'forja replay abc123', description: 'Replay run abc123 from scratch' },
    { cmd: 'forja replay abc123 --compare xyz789', description: 'Compare run abc123 against xyz789 without re-executing' },
    { cmd: 'forja replay abc123 --phases perf,security', description: 'Re-run only the perf and security phases' },
  ],
  flags: [
    { name: '--compare <run-id>', type: 'string', description: 'Compare against a different run ID without re-executing' },
    { name: '--phases <phases>', type: 'string', description: 'Comma-separated list of phases to replay (e.g. perf,security)' },
  ],
});
