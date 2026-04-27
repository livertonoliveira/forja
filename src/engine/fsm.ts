import { join } from 'node:path';
import type { ForjaStore } from '../store/interface.js';
import type { Run } from '../store/types.js';
import type { PluginRegistry } from '../plugin/registry.js';
import { TraceWriter } from '../trace/writer.js';
import { fingerprintCommand } from './fingerprint.js';
import type { HookRunner } from '../plugin/hooks.js';
import type { RunStartContext, RunResultContext, RunErrorContext } from '../plugin/types.js';

export type PipelineState = Run['status'];

export const VALID_TRANSITIONS: Record<PipelineState, PipelineState[]> = {
  init:     ['spec', 'dev'],
  spec:     ['dev'],
  dev:      ['test'],
  test:     ['perf', 'security', 'review', 'homolog'],
  perf:     ['review', 'homolog', 'failed'],
  security: ['review', 'homolog', 'failed'],
  review:   ['homolog', 'failed'],
  homolog:  ['pr'],
  pr:       ['done'],
  done:     [],
  failed:   ['dev'],
};

export class InvalidTransitionError extends Error {
  readonly from: PipelineState;
  readonly to: PipelineState;

  constructor(from: PipelineState, to: PipelineState) {
    super(`Invalid FSM transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

export class PipelineFSM {
  private trace: TraceWriter;
  private commandsDir: string;
  private hookRunner?: HookRunner;
  private phaseControllers = new Map<string, AbortController>();

  constructor(
    private store: ForjaStore,
    private runId: string,
    commandsDir?: string,
    _registry?: PluginRegistry, // reserved for Part 3 consumption
    hookRunner?: HookRunner,
  ) {
    this.trace = new TraceWriter(runId);
    this.commandsDir = commandsDir ?? join(process.cwd(), '.claude', 'commands', 'forja');
    this.hookRunner = hookRunner;
  }

  async bootstrapHooks(): Promise<void> {
    if (this.hookRunner) {
      await this.hookRunner.runOnRegister();
    }
  }

  async getState(): Promise<PipelineState> {
    const run = await this.store.getRun(this.runId);
    if (!run) throw new Error(`Run not found: ${this.runId}`);
    return run.status;
  }

  async canTransition(to: PipelineState): Promise<boolean> {
    const from = await this.getState();
    return VALID_TRANSITIONS[from].includes(to);
  }

  async transition(to: PipelineState): Promise<void> {
    const from = await this.getState();

    // Runtime allowlist check before building path
    const VALID_PHASE_NAMES = new Set(Object.keys(VALID_TRANSITIONS));
    if (!VALID_PHASE_NAMES.has(to)) {
      throw new InvalidTransitionError(from, to);
    }

    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new InvalidTransitionError(from, to);
    }

    try {
      await this.store.transitionRunStatus(this.runId, from, to);
    } catch (err) {
      // Another concurrent transition won the row-level lock — re-read actual state
      if (err instanceof Error && err.message.startsWith('concurrent transition:')) {
        const actual = await this.getState();
        throw new InvalidTransitionError(actual, to);
      }
      throw err;
    }

    if (this.hookRunner) {
      const ac = new AbortController();
      this.phaseControllers.set(to, ac);
      const ctx: RunStartContext = { runId: this.runId, phase: to, abortSignal: ac.signal };
      await this.hookRunner.runOnRun(ctx);
    }

    const commandPath = join(this.commandsDir, `${to}.md`);
    let commandFingerprint: string | undefined;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 200);
    try {
      commandFingerprint = await fingerprintCommand(commandPath, ac.signal);
    } catch {
      // timeout or missing file — skip
    } finally {
      clearTimeout(timer);
    }
    await this.trace.writePhaseStart(to, /* agentId */ undefined, /* spanId */ undefined, commandFingerprint);
  }

  async notifyPhaseResult(
    phase: PipelineState,
    status: 'pass' | 'warn' | 'fail',
    outputs?: Record<string, unknown>,
  ): Promise<void> {
    this.phaseControllers.get(phase)?.abort();
    this.phaseControllers.delete(phase);
    if (this.hookRunner) {
      const ctx: RunResultContext = { runId: this.runId, phase, status, outputs };
      await this.hookRunner.runOnResult(ctx);
    }
  }

  async notifyPhaseError(phase: PipelineState, error: Error): Promise<void> {
    this.phaseControllers.get(phase)?.abort();
    this.phaseControllers.delete(phase);
    if (this.hookRunner) {
      const ctx: RunErrorContext = { runId: this.runId, phase, error };
      await this.hookRunner.runOnError(ctx);
    }
  }
}
