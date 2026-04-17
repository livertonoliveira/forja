import { Command, Option } from 'commander';
import { readTrace, formatTrace } from '../../trace/index.js';

export const traceCommand = new Command('trace')
  .description('Inspect execution traces for a pipeline run')
  .option('--run <run-id>', 'Run ID to trace')
  .addOption(new Option('--format <format>', 'Output format').choices(['md', 'json', 'pretty']).default('pretty'))
  .action(async (options: { run?: string; format: 'md' | 'json' | 'pretty' }) => {
    if (!options.run) {
      console.error('error: --run <run-id> is required');
      process.exit(1);
    }
    const events = await readTrace(options.run);
    const output = await formatTrace(events, options.format);
    console.log(output);
  });
