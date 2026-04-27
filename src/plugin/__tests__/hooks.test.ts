import { describe, it, expect, vi } from 'vitest';
import { HookRunner } from '../hooks.js';
import type { HookRunnerOptions, PluginWithHooks } from '../hooks.js';
import type { TraceWriter } from '../../trace/writer.js';
import type { ForjaStore } from '../../store/interface.js';

const RUN_ID = '00000000-0000-0000-0000-000000000001';
const PHASE_ID = '00000000-0000-0000-0000-000000000002';

function makeTrace(): TraceWriter {
  return {
    writeFinding: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    writePhaseStart: vi.fn().mockResolvedValue(undefined),
    writePhaseEnd: vi.fn().mockResolvedValue(undefined),
    writeToolCall: vi.fn().mockResolvedValue(undefined),
    writeGateDecision: vi.fn().mockResolvedValue(undefined),
    writeCheckpoint: vi.fn().mockResolvedValue(undefined),
    writePluginRegistered: vi.fn().mockResolvedValue(undefined),
    writeError: vi.fn().mockResolvedValue(undefined),
  } as unknown as TraceWriter;
}

function makeStore(): ForjaStore {
  return {
    insertFinding: vi.fn().mockResolvedValue({ id: 'f1' }),
  } as unknown as ForjaStore;
}

function makeOptions(overrides: Partial<HookRunnerOptions> = {}): HookRunnerOptions {
  return {
    trace: makeTrace(),
    runId: RUN_ID,
    ...overrides,
  };
}

describe('HookRunner', () => {
  describe('onRegister', () => {
    it('calls onRegister for each plugin that implements it', async () => {
      const onRegister1 = vi.fn().mockResolvedValue(undefined);
      const onRegister2 = vi.fn().mockResolvedValue(undefined);
      const plugins: PluginWithHooks[] = [
        { id: 'plugin-a', hooks: { onRegister: onRegister1 } },
        { id: 'plugin-b', hooks: { onRegister: onRegister2 } },
      ];
      const runner = new HookRunner(plugins, makeOptions());

      await runner.runOnRegister();

      expect(onRegister1).toHaveBeenCalledOnce();
      expect(onRegister1).toHaveBeenCalledWith({ pluginId: 'plugin-a', runId: RUN_ID });
      expect(onRegister2).toHaveBeenCalledOnce();
      expect(onRegister2).toHaveBeenCalledWith({ pluginId: 'plugin-b', runId: RUN_ID });
    });

    it('skips plugins that do not implement onRegister', async () => {
      const onRun = vi.fn();
      const plugins: PluginWithHooks[] = [
        { id: 'plugin-a', hooks: { onRun } },
      ];
      const runner = new HookRunner(plugins, makeOptions());

      await runner.runOnRegister();

      expect(onRun).not.toHaveBeenCalled();
    });

    it('calls hooks in registration order (deterministic)', async () => {
      const order: string[] = [];
      const plugins: PluginWithHooks[] = [
        { id: 'first', hooks: { onRegister: () => { order.push('first'); } } },
        { id: 'second', hooks: { onRegister: () => { order.push('second'); } } },
        { id: 'third', hooks: { onRegister: () => { order.push('third'); } } },
      ];
      const runner = new HookRunner(plugins, makeOptions());

      await runner.runOnRegister();

      expect(order).toEqual(['first', 'second', 'third']);
    });
  });

  describe('onRun', () => {
    it('calls onRun for each plugin with the provided context', async () => {
      const onRun = vi.fn().mockResolvedValue(undefined);
      const plugins: PluginWithHooks[] = [{ id: 'plugin-a', hooks: { onRun } }];
      const runner = new HookRunner(plugins, makeOptions());
      const ac = new AbortController();
      const ctx = { runId: RUN_ID, phase: 'test', abortSignal: ac.signal };

      await runner.runOnRun(ctx);

      expect(onRun).toHaveBeenCalledWith(ctx);
    });
  });

  describe('onResult', () => {
    it('calls onResult with the provided context', async () => {
      const onResult = vi.fn().mockResolvedValue(undefined);
      const plugins: PluginWithHooks[] = [{ id: 'plugin-a', hooks: { onResult } }];
      const runner = new HookRunner(plugins, makeOptions());
      const ctx = { runId: RUN_ID, phase: 'test', status: 'pass' as const };

      await runner.runOnResult(ctx);

      expect(onResult).toHaveBeenCalledWith(ctx);
    });
  });

  describe('onError', () => {
    it('calls onError with the provided context', async () => {
      const onError = vi.fn().mockResolvedValue(undefined);
      const plugins: PluginWithHooks[] = [{ id: 'plugin-a', hooks: { onError } }];
      const runner = new HookRunner(plugins, makeOptions());
      const error = new Error('phase blew up');
      const ctx = { runId: RUN_ID, phase: 'dev', error };

      await runner.runOnError(ctx);

      expect(onError).toHaveBeenCalledWith(ctx);
    });
  });

  describe('error isolation', () => {
    it('does not propagate a hook error to the caller', async () => {
      const plugins: PluginWithHooks[] = [
        { id: 'bad-plugin', hooks: { onRun: () => { throw new Error('hook exploded'); } } },
      ];
      const options = makeOptions();
      const runner = new HookRunner(plugins, options);
      const ac = new AbortController();

      await expect(runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal })).resolves.toBeUndefined();
    });

    it('does not stop subsequent plugins when one hook throws', async () => {
      const secondHook = vi.fn().mockResolvedValue(undefined);
      const plugins: PluginWithHooks[] = [
        { id: 'bad-plugin', hooks: { onRun: () => { throw new Error('boom'); } } },
        { id: 'good-plugin', hooks: { onRun: secondHook } },
      ];
      const runner = new HookRunner(plugins, makeOptions());
      const ac = new AbortController();

      await runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal });

      expect(secondHook).toHaveBeenCalledOnce();
    });

    it('converts hook error to a low-severity finding written to trace', async () => {
      const trace = makeTrace();
      const plugins: PluginWithHooks[] = [
        { id: 'bad-plugin', hooks: { onRun: () => { throw new Error('hook exploded'); } } },
      ];
      const runner = new HookRunner(plugins, { trace, runId: RUN_ID });
      const ac = new AbortController();

      await runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal });

      expect(trace.writeFinding).toHaveBeenCalledOnce();
      const finding = vi.mocked(trace.writeFinding).mock.calls[0][0];
      expect(finding.severity).toBe('low');
      expect(finding.category).toBe('plugin_hook_error');
      expect(finding.runId).toBe(RUN_ID);
      expect(finding.title).toContain('bad-plugin');
      expect(finding.title).toContain('onRun');
    });

    it('writes finding to Postgres store when phaseId is provided', async () => {
      const trace = makeTrace();
      const store = makeStore();
      const plugins: PluginWithHooks[] = [
        { id: 'bad-plugin', hooks: { onRun: () => { throw new Error('db error'); } } },
      ];
      const runner = new HookRunner(plugins, { trace, store, runId: RUN_ID, phaseId: PHASE_ID });
      const ac = new AbortController();

      await runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal });

      expect(store.insertFinding).toHaveBeenCalledOnce();
      const dbFinding = vi.mocked(store.insertFinding).mock.calls[0][0];
      expect(dbFinding.severity).toBe('low');
      expect(dbFinding.category).toBe('plugin_hook_error');
      expect(dbFinding.runId).toBe(RUN_ID);
      expect(dbFinding.phaseId).toBe(PHASE_ID);
    });

    it('does not write to Postgres store when phaseId is absent', async () => {
      const trace = makeTrace();
      const store = makeStore();
      const plugins: PluginWithHooks[] = [
        { id: 'bad-plugin', hooks: { onRun: () => { throw new Error('db error'); } } },
      ];
      // no phaseId
      const runner = new HookRunner(plugins, { trace, store, runId: RUN_ID });
      const ac = new AbortController();

      await runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal });

      expect(store.insertFinding).not.toHaveBeenCalled();
      expect(trace.writeFinding).toHaveBeenCalledOnce();
    });
  });

  describe('timeout', () => {
    it('times out a hook that never resolves and records a medium-severity finding', async () => {
      const trace = makeTrace();
      const plugins: PluginWithHooks[] = [
        {
          id: 'slow-plugin',
          hooks: {
            onRun: () => new Promise<void>(() => { /* never resolves */ }),
          },
        },
      ];
      const runner = new HookRunner(plugins, { trace, runId: RUN_ID, timeoutMs: 50 });
      const ac = new AbortController();

      await runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal });

      expect(trace.writeFinding).toHaveBeenCalledOnce();
      const finding = vi.mocked(trace.writeFinding).mock.calls[0][0];
      expect(finding.severity).toBe('medium');
      expect(finding.category).toBe('plugin_hook_error');
      expect(finding.title).toContain('timeout');
    });

    it('uses default 5000ms timeout when timeoutMs is not specified', () => {
      const runner = new HookRunner([], makeOptions());
      // Access private field via type cast to verify default
      expect((runner as unknown as { timeoutMs: number }).timeoutMs).toBe(5000);
    });

    it('uses custom timeoutMs when specified', () => {
      const runner = new HookRunner([], makeOptions({ timeoutMs: 1234 }));
      expect((runner as unknown as { timeoutMs: number }).timeoutMs).toBe(1234);
    });

    it('truncates error.message to 256 chars in the finding description', async () => {
      const trace = makeTrace();
      const longMessage = 'x'.repeat(300);
      const plugins: PluginWithHooks[] = [
        { id: 'bad-plugin', hooks: { onRun: () => { throw new Error(longMessage); } } },
      ];
      const runner = new HookRunner(plugins, { trace, runId: RUN_ID });
      const ac = new AbortController();

      await runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal });

      const finding = vi.mocked(trace.writeFinding).mock.calls[0][0];
      expect(finding.description.length).toBeLessThanOrEqual(300); // total msg is bounded
      expect(finding.description).not.toContain('x'.repeat(257));
    });

    it('continues to the next plugin after a timeout', async () => {
      const trace = makeTrace();
      const secondHook = vi.fn().mockResolvedValue(undefined);
      const plugins: PluginWithHooks[] = [
        {
          id: 'slow-plugin',
          hooks: { onRun: () => new Promise<void>(() => { /* never resolves */ }) },
        },
        { id: 'fast-plugin', hooks: { onRun: secondHook } },
      ];
      const runner = new HookRunner(plugins, { trace, runId: RUN_ID, timeoutMs: 50 });
      const ac = new AbortController();

      await runner.runOnRun({ runId: RUN_ID, phase: 'dev', abortSignal: ac.signal });

      expect(secondHook).toHaveBeenCalledOnce();
    });
  });
});
