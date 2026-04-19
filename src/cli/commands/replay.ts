import { Command } from 'commander';
import { createStoreFromConfig } from '../../store/factory.js';
import type { PipelineState } from '../../engine/fsm.js';
import { replayRun } from '../../engine/replay.js';
import type { PhaseDiff, ReplayResult } from '../../engine/replay.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatPhaseDiff(diff: PhaseDiff): string {
  const phase = diff.phase.toUpperCase();

  if (
    !diff.gateDecisionChanged &&
    !diff.commandFingerprintChanged &&
    diff.findingsDiff.added.length === 0 &&
    diff.findingsDiff.removed.length === 0 &&
    diff.findingsDiff.changed.length === 0
  ) {
    const count = diff.originalCount ?? 0;
    const gate = (diff.originalGate ?? 'pass').toUpperCase();
    return `  PHASE ${phase} — same (${count} findings, same gate: ${gate})`;
  }

  const lines: string[] = [];
  lines.push(`  PHASE ${phase} — REGRESSION DETECTED`);

  for (const f of diff.findingsDiff.added) {
    const location = f.filePath
      ? `${f.filePath}${f.line != null ? `:${f.line}` : ''}`
      : 'unknown location';
    lines.push(`    + Added: [${f.severity}] ${f.title} in ${location} (was not in original)`);
  }

  for (const f of diff.findingsDiff.removed) {
    const location = f.filePath
      ? `${f.filePath}${f.line != null ? `:${f.line}` : ''}`
      : 'unknown location';
    lines.push(`    - Removed: [${f.severity}] ${f.title} in ${location} (was in original)`);
  }

  if (diff.gateDecisionChanged) {
    const from = (diff.originalGate ?? 'pass').toUpperCase();
    const to = (diff.replayGate ?? 'pass').toUpperCase();
    lines.push(`    Gate: ${from} → ${to}`);
  }

  if (diff.commandFingerprintChanged) {
    lines.push(`    ~ Command fingerprint changed (command file was modified)`);
  }

  return lines.join('\n');
}

export function formatResult(result: ReplayResult): string {
  const lines: string[] = [];
  lines.push(`Replay ${result.replayRunId} vs original ${result.originalRunId}`);
  lines.push('');

  for (const diff of result.diffs) {
    lines.push(formatPhaseDiff(diff));
  }

  lines.push('');
  lines.push(
    result.regression ? 'RESULT: REGRESSIONS DETECTED' : 'RESULT: no regressions detected',
  );

  return lines.join('\n');
}

const VALID_PHASES = new Set([
  'init', 'spec', 'dev', 'test', 'perf', 'security', 'review', 'homolog', 'pr', 'done', 'failed',
]);

function parsePhases(raw: string): PipelineState[] {
  const phases = raw.split(',').map((p) => p.trim());
  const invalid = phases.filter((p) => !VALID_PHASES.has(p));
  if (invalid.length > 0) throw new Error(`invalid phases: ${invalid.join(', ')}`);
  return phases as PipelineState[];
}

export const replayCommand = new Command('replay')
  .description('Replay a previous task execution by its run ID')
  .argument('<run-id>', 'ID of the run to replay')
  .option('--compare <run-id>', 'Compare against a different run ID without re-executing')
  .option('--phases <phases>', 'Comma-separated list of phases to replay (e.g., perf,security)')
  .action(async (runId: string, opts: { compare?: string; phases?: string }) => {
    if (!UUID_RE.test(runId)) {
      console.error('[forja] replay: invalid run ID format:', runId);
      process.exit(1);
    }

    if (opts.compare !== undefined && !UUID_RE.test(opts.compare)) {
      console.error('[forja] replay: invalid --compare run ID format:', opts.compare);
      process.exit(1);
    }

    const phases = opts.phases ? parsePhases(opts.phases) : undefined;

    const store = await createStoreFromConfig();
    try {
      const mode = opts.compare
        ? `comparing ${runId} against ${opts.compare}`
        : `replaying run ${runId}`;
      console.log(`[forja] replay: ${mode}${phases ? ` (phases: ${phases.join(', ')})` : ''}`);

      const result = await replayRun(store, {
        runId,
        phases,
        compareWith: opts.compare,
      });

      console.log(formatResult(result));

      if (result.regression) {
        process.exit(1);
      }
    } catch (err) {
      console.error(`[forja] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    } finally {
      await store.close().catch(() => {});
    }
  });
