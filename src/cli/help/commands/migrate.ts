import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'migrate',
  description: 'Migrate artifacts to the current schema version',
  usage: 'forja migrate <subcommand> [path] [options]',
  examples: [
    { cmd: 'forja migrate trace ./forja/trace.jsonl', description: 'Migrate a trace.jsonl file to the current schema' },
    { cmd: 'forja migrate report ./report.md --dry-run', description: 'Preview report migration without writing changes' },
    { cmd: 'forja migrate postgres', description: 'Migrate all PostgreSQL tables to the current schema' },
    { cmd: 'forja migrate trace ./trace.jsonl --from 1 --to 2', description: 'Migrate trace from schema v1 to v2' },
  ],
  flags: [
    { name: '--dry-run', type: 'boolean', description: 'Preview migration without writing changes' },
    { name: '--from <version>', type: 'string', description: 'Source schema version to migrate from' },
    { name: '--to <version>', type: 'string', description: 'Target schema version to migrate to' },
  ],
});
