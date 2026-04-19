import fs from 'fs/promises';
import path from 'path';
import type { ForjaStore } from '../store/interface.js';
import type { PipelineState } from './fsm.js';

export interface Checkpoint {
  runId: string;
  phase: PipelineState;
  completedAt: string;
  artifactPaths: string[];
  fsmState: PipelineState;
  phaseId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_PHASES = new Set<string>([
  'init', 'spec', 'dev', 'test', 'perf', 'security', 'review', 'homolog', 'pr', 'done', 'failed',
]);

// Ordered sequence used for reverse-walk in the file fallback.
const PIPELINE_SEQUENCE_FULL = [
  'init', 'spec', 'dev', 'test', 'perf', 'security', 'review', 'homolog', 'pr', 'done',
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateRunId(runId: string): void {
  if (!UUID_RE.test(runId)) {
    throw new Error(`invalid runId: ${JSON.stringify(runId)}`);
  }
  const base = path.resolve('forja/state/runs');
  const target = path.resolve('forja/state/runs', runId, 'checkpoints');
  if (!target.startsWith(base + path.sep)) {
    throw new Error('invalid runId');
  }
}

function validatePhase(phase: string): void {
  if (!VALID_PHASES.has(phase)) {
    throw new Error(`invalid phase: ${phase}`);
  }
}

function parseCheckpoint(raw: unknown): Checkpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (
    typeof c.runId !== 'string' ||
    typeof c.phase !== 'string' ||
    typeof c.completedAt !== 'string' ||
    typeof c.phaseId !== 'string' ||
    !Array.isArray(c.artifactPaths)
  ) return null;
  // fsmState is optional in persisted files (defaults to phase)
  const fsmState = typeof c.fsmState === 'string' ? c.fsmState : c.phase;
  return { ...(c as unknown as Checkpoint), fsmState: fsmState as PipelineState };
}

// ---------------------------------------------------------------------------
// CheckpointManager
// ---------------------------------------------------------------------------

export class CheckpointManager {
  private checkpointDir: string;
  private createdDirs = new Set<string>();

  constructor(
    private store: ForjaStore,
    private runId: string,
  ) {
    validateRunId(runId);
    this.checkpointDir = path.join('forja', 'state', 'runs', runId, 'checkpoints');
  }

  async save(phase: PipelineState, phaseId: string): Promise<void> {
    validatePhase(phase);

    const completedAt = new Date().toISOString();
    const runBase = path.join('forja', 'state', 'runs', this.runId);

    const checkpoint: Checkpoint = {
      runId: this.runId,
      phase,
      completedAt,
      artifactPaths: [
        path.join(runBase, 'trace.jsonl'),
        path.join(runBase, 'findings.json'),
        path.join(runBase, 'cost.json'),
      ],
      fsmState: phase,
      phaseId,
    };

    // Memoize mkdir — only create once per manager instance
    if (!this.createdDirs.has(this.checkpointDir)) {
      await fs.mkdir(this.checkpointDir, { recursive: true });
      this.createdDirs.add(this.checkpointDir);
    }

    // Run DB update and file write in parallel
    await Promise.all([
      this.store.updatePhase(phaseId, {
        status: 'completed',
        finishedAt: completedAt,
      }),
      fs.writeFile(
        path.join(this.checkpointDir, `${phase}.json`),
        JSON.stringify(checkpoint, null, 2),
        'utf8',
      ),
    ]);
  }

  async getLastCompleted(): Promise<Checkpoint | null> {
    const phases = await this.store.listPhases(this.runId);
    const completed = phases
      .filter((p) => p.status === 'completed' && p.finishedAt !== null)
      .sort((a, b) => {
        const ta = new Date(a.finishedAt!).getTime();
        const tb = new Date(b.finishedAt!).getTime();
        return tb - ta;
      });

    if (completed.length > 0) {
      const latest = completed[0];
      // Validate phase name from DB before casting
      const phaseName = VALID_PHASES.has(latest.name)
        ? (latest.name as PipelineState)
        : null;
      if (!phaseName) return null;
      return {
        runId: this.runId,
        phase: phaseName,
        completedAt: latest.finishedAt!,
        artifactPaths: [
          path.join('forja', 'state', 'runs', this.runId, 'trace.jsonl'),
          path.join('forja', 'state', 'runs', this.runId, 'findings.json'),
          path.join('forja', 'state', 'runs', this.runId, 'cost.json'),
        ],
        fsmState: phaseName,
        phaseId: latest.id,
      };
    }

    // Fallback: walk PIPELINE_SEQUENCE in reverse, return first file that exists
    for (const p of [...PIPELINE_SEQUENCE_FULL].reverse()) {
      const filePath = path.join(this.checkpointDir, `${p}.json`);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const parsed = parseCheckpoint(JSON.parse(content));
        if (parsed) return parsed;
      } catch {
        continue;
      }
    }
    return null;
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    const phases = await this.store.listPhases(this.runId);
    return phases
      .filter((p) => p.status === 'completed')
      .map((p) => ({
        runId: this.runId,
        phase: p.name as PipelineState,
        completedAt: p.finishedAt ?? p.startedAt,
        artifactPaths: [
          path.join('forja', 'state', 'runs', this.runId, 'trace.jsonl'),
          path.join('forja', 'state', 'runs', this.runId, 'findings.json'),
          path.join('forja', 'state', 'runs', this.runId, 'cost.json'),
        ],
        fsmState: p.name as PipelineState,
        phaseId: p.id,
      }));
  }

  async hasCompleted(phase: PipelineState): Promise<boolean> {
    const checkpoints = await this.listCheckpoints();
    return checkpoints.some((c) => c.phase === phase);
  }
}
