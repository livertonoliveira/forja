import { randomUUID } from 'node:crypto';
import type { AuditModule, AuditFinding, AuditContext, AuditReport, StackInfo } from '../plugin/types.js';
import type { HookRunner } from '../plugin/hooks.js';
import { countBySeverity } from './shared.js';

export interface RunnerOptions {
  cwd: string;
  stack: StackInfo;
  config?: Record<string, unknown>;
  concurrency?: number;
  timeoutMs?: number;
  runId?: string;
}

export interface AuditRunResult {
  moduleId: string;
  status: 'passed' | 'failed' | 'timed_out';
  findings: AuditFinding[];
  report: AuditReport | null;
  error?: string;
  bySeverity: Record<string, number>;
}

async function runSingleAudit(
  module: AuditModule,
  options: RunnerOptions,
  timeoutMs: number,
  runId: string,
  hookRunner: HookRunner | undefined,
): Promise<AuditRunResult> {
  const ac = new AbortController();
  const auditCtx: AuditContext = {
    cwd: options.cwd,
    stack: options.stack,
    config: options.config ?? {},
    abortSignal: ac.signal,
  };

  let timedOut = false;
  let status: AuditRunResult['status'] = 'passed';
  let findings: AuditFinding[] = [];
  let report: AuditReport | null = null;
  let error: string | undefined;

  await hookRunner?.runOnRun({ runId, phase: module.id, abortSignal: ac.signal });

  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, timeoutMs);

  try {
    const timeoutRace = new Promise<never>((_, reject) => {
      ac.signal.addEventListener(
        'abort',
        () => reject(new Error(`Audit "${module.id}" timed out after ${timeoutMs}ms`)),
        { once: true },
      );
    });
    // Suppress unhandled rejection if module.run() wins the race and the timer fires later
    timeoutRace.catch(() => {});
    findings = await Promise.race([module.run(auditCtx), timeoutRace]);
    report = module.report(findings);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    status = timedOut ? 'timed_out' : 'failed';
    report = null;
  } finally {
    clearTimeout(timer);
  }

  await hookRunner?.runOnResult({
    runId,
    phase: module.id,
    status: status === 'passed' ? 'pass' : 'fail',
    outputs: { moduleId: module.id, findingCount: findings.length },
  });

  return {
    moduleId: module.id,
    status,
    findings,
    report,
    ...(error !== undefined ? { error } : {}),
    bySeverity: countBySeverity(findings),
  };
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= tasks.length) break;
      results[index] = await tasks[index]();
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

export async function runAudits(
  modules: AuditModule[],
  options: RunnerOptions,
  hookRunner?: HookRunner,
): Promise<AuditRunResult[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 64));
  const timeoutMs = Math.max(100, options.timeoutMs ?? 120_000);
  const runId = options.runId ?? randomUUID();

  const applicable = modules.filter((m) => m.detect(options.stack).applicable === true);

  const tasks = applicable.map(
    (module) => () => runSingleAudit(module, options, timeoutMs, runId, hookRunner),
  );

  return runWithConcurrency(tasks, concurrency);
}
