import { Command } from 'commander';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { FindingWriter } from '../../trace/finding-writer.js';
import { TraceWriter } from '../../trace/writer.js';
import { GateDecision } from '../../schemas/index.js';

export const gateCommand = new Command('gate')
  .description('Evaluate quality gates for a pipeline run')
  .requiredOption('--run <run-id>', 'Run ID to evaluate')
  .action(async (_opts, cmd) => {
    const { run } = cmd.opts() as { run: string };
    z.string().uuid().parse(run);

    const findings = await FindingWriter.readAll(run);
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const highCount = findings.filter(f => f.severity === 'high').length;
    const mediumCount = findings.filter(f => f.severity === 'medium').length;
    const lowCount = findings.filter(f => f.severity === 'low').length;

    const decision: 'pass' | 'warn' | 'fail' =
      criticalCount > 0 || highCount > 0 ? 'fail' :
      mediumCount > 0 ? 'warn' : 'pass';

    const gateDecision: GateDecision = {
      id: randomUUID(),
      runId: run,
      decision,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      policyApplied: 'default',
      decidedAt: new Date().toISOString(),
    };

    const traceWriter = new TraceWriter(run);
    await traceWriter.writeGateDecision(gateDecision);

    console.log(`[forja] gate: ${decision} (critical=${criticalCount}, high=${highCount}, medium=${mediumCount}, low=${lowCount})`);

    if (criticalCount > 0 || highCount > 0) process.exit(2);
    if (mediumCount > 0) process.exit(1);
    process.exit(0);
  });
