import { Command, Option } from 'commander';

export const traceCommand = new Command('trace')
  .description('Inspect execution traces for a pipeline run')
  .option('--run <run-id>', 'Run ID to trace')
  .addOption(new Option('--format <format>', 'Output format').choices(['md', 'json', 'pretty']))
  .action(() => {
    console.log('[forja] trace — ainda não implementado');
  });
