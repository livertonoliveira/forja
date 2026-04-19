import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { join, resolve } from 'path';
import { FindingWriter } from '../../trace/finding-writer.js';
import { TraceWriter } from '../../trace/writer.js';
import { GateDecision } from '../../schemas/index.js';
import { loadPolicy, evaluatePolicy } from '../../policy/index.js';

export const gateCommand = new Command('gate')
  .description('Evaluate quality gates for a pipeline run')
  .requiredOption('--run <run-id>', 'Run ID to evaluate')
  .option('--policy <path>', 'Path to policy YAML file', join(process.cwd(), 'policies/default.yaml'))
  .action(async (_opts, cmd) => {
    try {
      const { run, policy: rawPolicyPath } = cmd.opts() as { run: string; policy: string };
      z.string().uuid().parse(run);

      const policyPath = resolve(rawPolicyPath);
      if (!policyPath.startsWith(process.cwd())) {
        console.error(`[forja] gate: policy path must be inside the project directory`);
        process.exit(1);
      }

      const [findings, policy] = await Promise.all([
        FindingWriter.readAll(run),
        loadPolicy(policyPath),
      ]);

      const result = evaluatePolicy(findings, policy);
      const { decision } = result;

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
        policyApplied: policy.version,
        decidedAt: new Date().toISOString(),
      };

      const traceWriter = new TraceWriter(run);
      await traceWriter.writeGateDecision(gateDecision);

      console.log(`[forja] gate: ${decision} (critical=${criticalCount}, high=${highCount}, medium=${mediumCount}, low=${lowCount})`);

      if (decision === 'fail') process.exit(2);
      if (decision === 'warn') process.exit(1);
      process.exit(0);
    } catch (err) {
      console.error(`[forja] gate: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
