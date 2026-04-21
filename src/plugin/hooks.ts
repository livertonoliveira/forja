import { randomUUID } from 'node:crypto';
import type {
  PluginLifecycleHooks,
  RegisterContext,
  RunStartContext,
  RunResultContext,
  RunErrorContext,
} from './types.js';
import type { TraceWriter } from '../trace/writer.js';
import type { ForjaStore } from '../store/interface.js';
import type { Finding } from '../schemas/index.js';

export interface HookRunnerOptions {
  timeoutMs?: number;
  trace: TraceWriter;
  store?: ForjaStore;
  runId: string;
  phaseId?: string;
}

export interface PluginWithHooks {
  id: string;
  hooks: PluginLifecycleHooks;
}

export class HookRunner {
  private timeoutMs: number;

  constructor(
    private plugins: PluginWithHooks[],
    private options: HookRunnerOptions,
  ) {
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async runOnRegister(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.hooks.onRegister) {
        const ctx: RegisterContext = { pluginId: plugin.id, runId: this.options.runId };
        await this.executeWithTimeout(plugin, 'onRegister', () => plugin.hooks.onRegister!(ctx));
      }
    }
  }

  async runOnRun(ctx: RunStartContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.hooks.onRun) {
        await this.executeWithTimeout(plugin, 'onRun', () => plugin.hooks.onRun!(ctx));
      }
    }
  }

  async runOnResult(ctx: RunResultContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.hooks.onResult) {
        await this.executeWithTimeout(plugin, 'onResult', () => plugin.hooks.onResult!(ctx));
      }
    }
  }

  async runOnError(ctx: RunErrorContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.hooks.onError) {
        await this.executeWithTimeout(plugin, 'onError', () => plugin.hooks.onError!(ctx));
      }
    }
  }

  private async executeWithTimeout(
    plugin: PluginWithHooks,
    hookName: string,
    fn: () => void | Promise<void>,
  ): Promise<void> {
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, this.timeoutMs);

    try {
      const hookPromise = Promise.resolve().then(fn);
      hookPromise.catch(() => {}); // silence unhandled rejection on the abandoned promise after timeout
      await Promise.race([
        hookPromise,
        new Promise<never>((_, reject) => {
          ac.signal.addEventListener(
            'abort',
            () => reject(new Error(`Hook timed out after ${this.timeoutMs}ms`)),
            { once: true },
          );
        }),
      ]);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.recordFailure(plugin, hookName, timedOut, error);
    } finally {
      clearTimeout(timer);
    }
  }

  private async recordFailure(
    plugin: PluginWithHooks,
    hookName: string,
    isTimeout: boolean,
    error: Error,
  ): Promise<void> {
    const severity = isTimeout ? 'medium' : 'low';
    const title = isTimeout
      ? `Plugin hook timeout: ${plugin.id}/${hookName}`
      : `Plugin hook error: ${plugin.id}/${hookName}`;
    const safeMessage = error.message.slice(0, 256);
    const description = isTimeout
      ? `Plugin "${plugin.id}" hook "${hookName}" exceeded ${this.timeoutMs}ms and was aborted.`
      : `Plugin "${plugin.id}" hook "${hookName}" threw: ${safeMessage}`;
    const phaseId = this.options.phaseId ?? randomUUID();
    const createdAt = new Date().toISOString();

    const finding: Finding = {
      id: randomUUID(),
      runId: this.options.runId,
      phaseId,
      severity,
      category: 'plugin_hook_error',
      title,
      description,
      createdAt,
    };

    await this.options.trace.writeFinding(finding);

    if (this.options.store && this.options.phaseId) {
      await this.options.store.insertFinding({
        runId: this.options.runId,
        phaseId: this.options.phaseId,
        agentId: null,
        severity,
        category: 'plugin_hook_error',
        title,
        description,
        filePath: null,
        line: null,
        suggestion: null,
        owasp: null,
        cwe: null,
        createdAt,
      });
    }
  }
}
