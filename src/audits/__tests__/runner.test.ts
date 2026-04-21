import { describe, it, expect, vi } from 'vitest';
import type { AuditModule, AuditFinding, AuditContext } from '../../plugin/types.js';
import { runAudits } from '../runner.js';
import { consolidate } from '../consolidator.js';

function makeModule(id: string, delay: number, findings: AuditFinding[] = []): AuditModule {
  return {
    id,
    detect: () => ({ applicable: true }),
    async run(ctx: AuditContext): Promise<AuditFinding[]> {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        ctx.abortSignal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        }, { once: true });
      });
      return findings;
    },
    report: (findings) => ({ markdown: `# Report\n${findings.length} findings`, json: { findings } }),
  };
}

const stack = { language: 'typescript', runtime: 'node' };

describe('runAudits', () => {
  it('runs 3 audits in parallel and returns all results', async () => {
    const modules = [
      makeModule('mod-a', 10),
      makeModule('mod-b', 20),
      makeModule('mod-c', 10),
    ];

    const results = await runAudits(modules, { cwd: '/tmp', stack });

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.status)).toEqual(['passed', 'passed', 'passed']);
    expect(results.map((r) => r.moduleId)).toEqual(['mod-a', 'mod-b', 'mod-c']);
  });

  it('kills audit that exceeds timeout and marks it as timed_out', async () => {
    const modules = [makeModule('slow-mod', 5000)];

    const results = await runAudits(modules, { cwd: '/tmp', stack, timeoutMs: 50 });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('timed_out');
    expect(results[0].error).toMatch(/timed out/);
    expect(results[0].report).toBeNull();
  });

  it('failure in one audit does not affect others', async () => {
    const throwingModule: AuditModule = {
      id: 'throwing-mod',
      detect: () => ({ applicable: true }),
      async run(): Promise<AuditFinding[]> {
        throw new Error('unexpected failure');
      },
      report: () => ({ markdown: '', json: {} }),
    };
    const goodModule = makeModule('good-mod', 10);

    const results = await runAudits([throwingModule, goodModule], { cwd: '/tmp', stack });

    expect(results).toHaveLength(2);
    const throwing = results.find((r) => r.moduleId === 'throwing-mod')!;
    const good = results.find((r) => r.moduleId === 'good-mod')!;
    expect(throwing.status).toBe('failed');
    expect(throwing.error).toBe('unexpected failure');
    expect(good.status).toBe('passed');
  });

  it('filters out non-applicable modules', async () => {
    const skippedModule: AuditModule = {
      id: 'skipped-mod',
      detect: () => ({ applicable: false }),
      async run(): Promise<AuditFinding[]> { return []; },
      report: () => ({ markdown: '', json: {} }),
    };

    const results = await runAudits([skippedModule], { cwd: '/tmp', stack });

    expect(results).toHaveLength(0);
  });

  it('returns empty array when modules list is empty', async () => {
    const results = await runAudits([], { cwd: '/tmp', stack });
    expect(results).toHaveLength(0);
  });

  it('returns empty array when all modules are non-applicable', async () => {
    const modules = [
      { id: 'a', detect: () => ({ applicable: false }), async run() { return []; }, report: () => ({ markdown: '', json: {} }) },
      { id: 'b', detect: () => ({ applicable: false }), async run() { return []; }, report: () => ({ markdown: '', json: {} }) },
    ];
    const results = await runAudits(modules, { cwd: '/tmp', stack });
    expect(results).toHaveLength(0);
  });

  it('invokes lifecycle hooks before and after each audit', async () => {
    const module = makeModule('hook-mod', 10);
    const hookRunner = {
      runOnRun: vi.fn().mockResolvedValue(undefined),
      runOnResult: vi.fn().mockResolvedValue(undefined),
    } as any;

    await runAudits([module], { cwd: '/tmp', stack, runId: 'run-123' }, hookRunner);

    expect(hookRunner.runOnRun).toHaveBeenCalledOnce();
    expect(hookRunner.runOnRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-123', phase: 'hook-mod' }),
    );
    expect(hookRunner.runOnResult).toHaveBeenCalledOnce();
    expect(hookRunner.runOnResult).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run-123', phase: 'hook-mod', status: 'pass' }),
    );
  });
});

describe('consolidate', () => {
  it('produces report with all modules marked', () => {
    const passedResult = {
      moduleId: 'mod-pass',
      status: 'passed' as const,
      findings: [],
      report: { markdown: '# Passed', json: {} },
      bySeverity: {},
    };
    const failedResult = {
      moduleId: 'mod-fail',
      status: 'failed' as const,
      findings: [],
      report: null,
      error: 'something went wrong',
      bySeverity: {},
    };

    const { markdown, json } = consolidate([passedResult, failedResult]);

    expect(json.summary.total).toBe(0);
    expect(json.summary.failedCount).toBe(1);
    expect(json.summary.passedCount).toBe(1);
    expect(json.modules).toHaveLength(2);
    expect(markdown).toContain('mod-pass');
    expect(markdown).toContain('mod-fail');
  });

  it('orders top 10 by severity', () => {
    const finding = (severity: AuditFinding['severity'], title: string): AuditFinding => ({
      severity,
      title,
      category: 'test',
      description: 'desc',
    });

    const result = {
      moduleId: 'sev-mod',
      status: 'passed' as const,
      findings: [
        finding('low', 'Low finding'),
        finding('critical', 'Critical finding'),
        finding('medium', 'Medium finding'),
        finding('high', 'High finding'),
      ],
      report: { markdown: '# Sev', json: {} },
      bySeverity: { low: 1, critical: 1, medium: 1, high: 1 },
    };

    const { json } = consolidate([result]);

    expect(json.top10Findings[0].finding.severity).toBe('critical');
    expect(json.top10Findings[1].finding.severity).toBe('high');
    expect(json.top10Findings[2].finding.severity).toBe('medium');
    expect(json.top10Findings[3].finding.severity).toBe('low');
  });
});
