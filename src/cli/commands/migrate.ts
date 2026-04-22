import path from 'path';
import { Command } from 'commander';
import { registry } from '../../store/migrations/registry.js';
import { TraceRunner } from '../../store/migrations/trace-runner.js';
import { ReportRunner } from '../../store/migrations/report-runner.js';
import { PostgresRunner } from '../../store/migrations/postgres-runner.js';

function resolveArtifactPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const cwd = path.resolve(process.cwd());
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    console.error(`error: path must be within the current working directory: ${filePath}`);
    process.exit(1);
  }
  return resolved;
}

export const migrateCommand = new Command('migrate')
  .description('Migrate artifacts to the current schema version');

migrateCommand.addCommand(
  new Command('trace')
    .description('Migrate a trace.jsonl file to the current schema version')
    .argument('<path>', 'Path to the trace.jsonl file')
    .option('--dry-run', 'Show what would be migrated without writing')
    .option('--from <version>', 'Source schema version (default: read from file header)')
    .option('--to <version>', 'Target schema version (default: CURRENT_SCHEMA_VERSION)')
    .action(async (filePath: string, options: { dryRun?: boolean; from?: string; to?: string }) => {
      const runner = new TraceRunner(registry, { dryRun: options.dryRun, from: options.from, to: options.to });
      await runner.apply(resolveArtifactPath(filePath));
    }),
);

migrateCommand.addCommand(
  new Command('report')
    .description('Migrate a report file to the current schema version')
    .argument('<path>', 'Path to the report file')
    .option('--dry-run', 'Show what would be migrated without writing')
    .option('--from <version>', 'Source schema version (default: read from file header)')
    .option('--to <version>', 'Target schema version (default: CURRENT_SCHEMA_VERSION)')
    .action(async (filePath: string, options: { dryRun?: boolean; from?: string; to?: string }) => {
      const runner = new ReportRunner(registry, { dryRun: options.dryRun, from: options.from, to: options.to });
      await runner.apply(resolveArtifactPath(filePath));
    }),
);

migrateCommand.addCommand(
  new Command('postgres')
    .description('Migrate all PostgreSQL tables to the current schema version')
    .option('--dry-run', 'Show what would be migrated without writing')
    .option('--from <version>', 'Source schema version')
    .option('--to <version>', 'Target schema version')
    .action(async (options: { dryRun?: boolean; from?: string; to?: string }) => {
      const connectionString = process.env['FORJA_STORE_URL'];
      if (!connectionString) {
        console.error('error: FORJA_STORE_URL environment variable is not set');
        process.exit(1);
      }
      const runner = new PostgresRunner(registry, { dryRun: options.dryRun, from: options.from, to: options.to });
      await runner.apply(connectionString);
    }),
);
