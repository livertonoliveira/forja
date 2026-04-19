import { join } from 'path';
import type { ForjaStore } from '../store/interface.js';
import type { Run } from '../store/types.js';
import { TraceWriter } from '../trace/writer.js';
import { fingerprintCommand } from './fingerprint.js';

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

  constructor(
    private store: ForjaStore,
    private runId: string,
    commandsDir?: string,
  ) {
    this.trace = new TraceWriter(runId);
    this.commandsDir = commandsDir ?? join(process.cwd(), '.claude', 'commands', 'forja');
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
}
