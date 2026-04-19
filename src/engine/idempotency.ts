import type { CheckpointManager } from './checkpoint.js';
import type { ForjaStore } from '../store/interface.js';
import type { PipelineState } from './fsm.js';
import type { Checkpoint } from './checkpoint.js';

export class PhaseIdempotencyGuard {
  private completedCache: Set<PipelineState> | null = null;

  constructor(private checkpointManager: CheckpointManager) {}

  private async loadCompleted(): Promise<Set<PipelineState>> {
    if (!this.completedCache) {
      const checkpoints: Checkpoint[] = await this.checkpointManager.listCheckpoints();
      this.completedCache = new Set(checkpoints.map((c) => c.phase));
    }
    return this.completedCache;
  }

  async shouldRun(phase: PipelineState, options?: { force?: boolean }): Promise<boolean> {
    if (options?.force) return true;
    const completed = await this.loadCompleted();
    if (completed.has(phase)) {
      console.log(`[forja] Phase '${phase}' already completed — skipping. Use --force to re-run.`);
      return false;
    }
    return true;
  }
}

export async function cleanPhaseData(
  store: ForjaStore,
  runId: string,
  phase: PipelineState,
  checkpointManager: CheckpointManager,
): Promise<void> {
  await store.deletePhaseData(runId, phase);
  await checkpointManager.deleteCheckpoint(phase);
}
