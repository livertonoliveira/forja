import { registerCommand } from '../command-registry.js';

registerCommand({
  name: 'policies',
  description: 'Manage Forja policy files',
  usage: 'forja policies <subcommand>',
  examples: [
    { cmd: 'forja policies migrate', description: 'Migrate all legacy policy YAML files to DSL format' },
    { cmd: 'forja policies migrate --dry-run', description: 'Preview migration without writing files' },
    { cmd: 'forja policies migrate --in policies/old.yaml --out policies/new.yaml', description: 'Migrate a specific policy file' },
  ],
  flags: [
    { name: '--dry-run', type: 'boolean', description: 'Print diff without writing files (use with "migrate" subcommand)' },
    { name: '--in <path>', type: 'string', description: 'Input file to migrate (default: all policies/*.yaml)' },
    { name: '--out <path>', type: 'string', description: 'Custom output destination for the migrated file' },
  ],
});
