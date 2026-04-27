import fs from 'fs/promises';
import path from 'path';
import { Command, Option } from 'commander';
import { readTrace, formatTrace, generateDashboard } from '../../trace/index.js';
import { initActiveRun, readActiveRun, clearActiveRun } from '../../trace/active-run.js';
import { TraceWriter } from '../../trace/writer.js';

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

traceCommand
  .command('init')
  .description('Start a new trace run and write forja/state/.active-run')
  .option('--issue <issue-id>', 'Linear issue ID associated with this run')
  .action(async (options: { issue?: string }) => {
    const runId = await initActiveRun(options.issue);
    const writer = new TraceWriter(runId);
    await writer.write({
      runId,
      eventType: 'run_start',
      payload: { issueId: options.issue ?? '', source: 'skill' },
    });
    process.stdout.write(runId + '\n');
  });

traceCommand
  .command('finish')
  .description('Finalize the active run and clear forja/state/.active-run')
  .option('--status <status>', 'Run status (done|incomplete)', 'done')
  .option('--pr-url <url>', 'Pull request URL to record')
  .action(async (options: { status: string; prUrl?: string }) => {
    const active = await readActiveRun();
    if (!active) {
      process.stderr.write('[forja] trace finish: no active run found\n');
      process.exit(1);
    }
    const writer = new TraceWriter(active.runId);
    await writer.write({
      runId: active.runId,
      eventType: 'run_end',
      payload: {
        status: options.status,
        ...(options.prUrl ? { prUrl: options.prUrl } : {}),
      },
    });
    await clearActiveRun();
    process.stdout.write(`[forja] run ${active.runId} finalized with status: ${options.status}\n`);
  });
