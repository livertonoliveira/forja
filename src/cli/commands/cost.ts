import { Command } from 'commander';
import { CostReporter } from '../../cost/index.js';

export const costCommand = new Command('cost')
  .description('Show cost analysis for a pipeline run')
  .option('--run <run-id>', 'Run ID to analyze')
  .action(async (opts: { run?: string }) => {
    if (!opts.run) {
      process.stderr.write('[forja] cost: --run <run-id> is required\n');
      process.exit(1);
    }
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(opts.run)) {
      process.stderr.write('[forja] cost: --run must be a valid UUID\n');
      process.exit(1);
    }
    const reporter = new CostReporter();
    const output = await reporter.format(opts.run);
    console.log(output);
  });
