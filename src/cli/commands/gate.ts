import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { join, resolve, relative, isAbsolute } from 'path';
import { FindingWriter } from '../../trace/finding-writer.js';
import { TraceWriter } from '../../trace/writer.js';
import { DualWriter } from '../../trace/dual-writer.js';
import { GateDecision } from '../../schemas/index.js';
import { loadPolicy, evaluatePolicy, executeActions } from '../../policy/index.js';
import { loadConfig } from '../../config/loader.js';
import { createStore } from '../../store/index.js';
import type { ForjaStore } from '../../store/interface.js';

// Unlike createStoreFromConfig() in store/factory.ts, this falls back gracefully
// instead of hard-exiting — gate must work in JSONL-only environments.
async function tryCreateStore(): Promise<ForjaStore | null> {
  const config = await loadConfig();
  if (config.source === 'default') return null;
  const store = createStore(config.storeUrl);
  try {
    await store.ping();
    return store;
  } catch {
    console.warn(`[forja] gate: could not connect to Postgres — persisting to JSONL only`);
    await store.close().catch(() => {});
    return null;
  }
}

export const gateCommand = new Command('gate')
  .description('Evaluate quality gates for a pipeline run')
  .requiredOption('--run <run-id>', 'Run ID to evaluate')
  .option('--policy <path>', 'Path to policy YAML file', join(process.cwd(), 'policies/default.yaml'))
  .action(async (_opts, cmd) => {
    try {
      const { run, policy: rawPolicyPath } = cmd.opts() as { run: string; policy: string };
      z.string().uuid().parse(run);

      const policyPath = resolve(rawPolicyPath);
      const rel = relative(process.cwd(), policyPath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        console.error(`[forja] gate: policy path must be inside the project directory`);
        process.exit(1);
      }

      const [findings, policy, store] = await Promise.all([
        FindingWriter.readAll(run),
        loadPolicy(policyPath),
        tryCreateStore(),
      ]);

      const result = evaluatePolicy(findings, policy);
      const { decision, actions } = result;

      const criticalCount = findings.filter(f => f.severity === 'critical').length;
      const highCount = findings.filter(f => f.severity === 'high').length;
      const mediumCount = findings.filter(f => f.severity === 'medium').length;
      const lowCount = findings.filter(f => f.severity === 'low').length;

      const gateDecision: GateDecision = {
        id: randomUUID(),
        runId: run,
        decision,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        policyApplied: rel,
        justification: null,
        decidedAt: new Date().toISOString(),
      };

      const traceWriter = new TraceWriter(run);
      try {
        if (store) {
          const dualWriter = new DualWriter(traceWriter, store, run);
          await dualWriter.writeGateDecision(gateDecision);
        } else {
          await traceWriter.writeGateDecision(gateDecision);
        }
      } finally {
        await store?.close().catch(() => {});
      }

      await executeActions(actions, { runId: run });

      console.log(`[forja] gate: ${decision} (critical=${criticalCount}, high=${highCount}, medium=${mediumCount}, low=${lowCount})`);

      if (decision === 'fail') process.exit(2);
      if (decision === 'warn') process.exit(1);
      process.exit(0);
    } catch (err) {
      console.error(`[forja] gate: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
