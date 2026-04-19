import type { ForjaStore } from '../store/interface.js';
import type { Run } from '../store/types.js';
import { TraceWriter } from '../trace/writer.js';

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

  constructor(
    private store: ForjaStore,
    private runId: string,
  ) {
    this.trace = new TraceWriter(runId);
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

    await this.trace.writePhaseStart(to);
  }
}
