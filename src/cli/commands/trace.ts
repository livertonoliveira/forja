import fs from 'fs/promises';
import path from 'path';
import { Command, Option } from 'commander';
import { readTrace, formatTrace, generateDashboard } from '../../trace/index.js';

function resolveOutputPath(output: string): string {
  const resolved = path.resolve(output);
  const cwd = path.resolve(process.cwd());
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new Error(`--output path must be within the current working directory: ${output}`);
  }
  return resolved;
}

export const traceCommand = new Command('trace')
  .description('Inspect execution traces for a pipeline run')
  .option('--run <run-id>', 'Run ID to trace')
  .addOption(
    new Option('--format <format>', 'Output format: "md" generates a dashboard report; "json"/"pretty" show raw events')
      .choices(['md', 'json', 'pretty'])
      .default('pretty'),
  )
  .option('--output <file>', 'Write output to file instead of stdout (must be within cwd)')
  .action(async (options: { run?: string; format: 'md' | 'json' | 'pretty'; output?: string }) => {
    if (!options.run) {
      console.error('error: --run <run-id> is required');
      process.exit(1);
    }

    let output: string;
    if (options.format === 'md') {
      output = await generateDashboard(options.run);
    } else {
      const events = await readTrace(options.run);
      output = await formatTrace(events, options.format);
    }

    if (options.output) {
      const outPath = resolveOutputPath(options.output);
      await fs.writeFile(outPath, output, 'utf8');
    } else {
      console.log(output);
    }
  });
