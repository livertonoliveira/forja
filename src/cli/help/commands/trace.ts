import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'trace',
  description: 'Inspect execution traces for a pipeline run',
  usage: 'forja trace [options]',
  examples: [
    { cmd: 'forja trace --run abc123', description: 'Show trace for run abc123 in pretty format' },
    { cmd: 'forja trace --run abc123 --format md', description: 'Generate a markdown dashboard report' },
    { cmd: 'forja trace --run abc123 --format json --output trace.json', description: 'Export trace as JSON to a file' },
    { cmd: 'forja trace init --issue MOB-123', description: 'Start a new trace run for issue MOB-123' },
    { cmd: 'forja trace finish --status done --pr-url https://github.com/org/repo/pull/1', description: 'Finalize the active run with a PR URL' },
  ],
  flags: [
    { name: '--run <run-id>', type: 'string', description: 'Run ID to inspect' },
    { name: '--format <format>', type: 'string', default: 'pretty', description: 'Output format: md | json | pretty' },
    { name: '--output <file>', type: 'string', description: 'Write output to file instead of stdout' },
  ],
});
