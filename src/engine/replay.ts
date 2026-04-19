import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import type { ForjaStore } from '../store/interface.js';
import type { Finding, GateDecision } from '../store/types.js';
import type { PipelineState } from './fsm.js';
import { detectCommandDrift } from './drift-detector.js';

const execFileAsync = promisify(execFile);

export interface ReplayOptions {
  runId: string;
  phases?: PipelineState[];
  compareWith?: string;
}

export interface ReplayResult {
  originalRunId: string;
  replayRunId: string;
  diffs: PhaseDiff[];
  regression: boolean;
}

export interface PhaseDiff {
  phase: PipelineState;
  findingsDiff: { added: Finding[]; removed: Finding[]; changed: Finding[] };
  gateDecisionChanged: boolean;
  commandFingerprintChanged: boolean;
  originalGate?: GateDecision['decision'];
  replayGate?: GateDecision['decision'];
  originalCount?: number;
  replayCount?: number;
}

function findingKey(f: Finding): string {
  return `${f.severity}:${f.category}:${f.title}:${f.filePath ?? ''}:${f.line ?? ''}`;
}

function hasRegression(diffs: PhaseDiff[]): boolean {
  return (
    diffs.some((d) => d.gateDecisionChanged) ||
    diffs.some((d) => d.findingsDiff.added.some((f) => f.severity === 'critical' || f.severity === 'high'))
  );
}

export async function compareRuns(
  store: ForjaStore,
  runId1: string,
  runId2: string,
  phases?: PipelineState[],
): Promise<PhaseDiff[]> {
  const [phases1, phases2] = await Promise.all([
    store.listPhases(runId1),
    store.listPhases(runId2),
  ]);

  const targetPhases: PipelineState[] =
    phases && phases.length > 0
      ? phases
      : [...new Set([...phases1.map(p => p.name as PipelineState), ...phases2.map(p => p.name as PipelineState)])];

  const phaseMap1 = new Map(phases1.map(p => [p.name as PipelineState, p]));
  const phaseMap2 = new Map(phases2.map(p => [p.name as PipelineState, p]));

  const findingsAndGates = await Promise.all(
    targetPhases.map(async phase => {
      const phase1 = phaseMap1.get(phase);
      const phase2 = phaseMap2.get(phase);

      const [findings1, findings2, gate1, gate2] = await Promise.all([
        phase1 ? store.listFindings({ runId: runId1, phaseId: phase1.id }) : Promise.resolve([] as Finding[]),
        phase2 ? store.listFindings({ runId: runId2, phaseId: phase2.id }) : Promise.resolve([] as Finding[]),
        phase1 ? store.getLatestGateDecision(runId1, phase1.id) : Promise.resolve(null),
        phase2 ? store.getLatestGateDecision(runId2, phase2.id) : Promise.resolve(null),
      ]);

      return { phase, findings1, findings2, gate1, gate2 };
    }),
  );

  let driftReport: Awaited<ReturnType<typeof detectCommandDrift>> | null = null;
  try {
    driftReport = await detectCommandDrift(runId1, runId2);
  } catch {
    // traces may be unavailable
  }

  const driftedPhases = new Set(driftReport?.drifted.map(d => d.phase) ?? []);

  return findingsAndGates.map(({ phase, findings1, findings2, gate1, gate2 }) => {
    const map1 = new Map(findings1.map(f => [findingKey(f), f]));
    const map2 = new Map(findings2.map(f => [findingKey(f), f]));

    const added = findings2.filter(f => !map1.has(findingKey(f)));
    const removed = findings1.filter(f => !map2.has(findingKey(f)));

    const gateDecisionChanged =
      gate1 !== null && gate2 !== null && gate1.decision !== gate2.decision;

    return {
      phase,
      findingsDiff: { added, removed, changed: [] },
      gateDecisionChanged,
      commandFingerprintChanged: driftedPhases.has(phase),
      originalGate: gate1?.decision,
      replayGate: gate2?.decision,
      originalCount: findings1.length,
      replayCount: findings2.length,
    };
  });
}

export async function replayRun(store: ForjaStore, options: ReplayOptions): Promise<ReplayResult> {
  if (options.compareWith !== undefined) {
    const [originalRun, compareRun] = await Promise.all([
      store.getRun(options.runId),
      store.getRun(options.compareWith),
    ]);

    if (!originalRun) {
      throw new Error(`Run not found: ${options.runId}`);
    }
    if (!compareRun) {
      throw new Error(`Run not found: ${options.compareWith}`);
    }

    const diffs = await compareRuns(store, options.runId, options.compareWith, options.phases);
    return { originalRunId: options.runId, replayRunId: options.compareWith, diffs, regression: hasRegression(diffs) };
  }

  const originalRun = await store.getRun(options.runId);
  if (!originalRun) {
    throw new Error(`Run not found: ${options.runId}`);
  }

  const SHA_RE = /^[0-9a-f]{40}$/i;
  const ISSUE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

  if (originalRun.gitSha) {
    if (!SHA_RE.test(originalRun.gitSha)) {
      console.warn('[forja] replay: invalid git SHA format recorded in run — replaying with current state');
    } else {
      try {
        await execFileAsync('git', ['cat-file', '-e', originalRun.gitSha]);
      } catch {
        console.warn(`[forja] replay: git SHA ${originalRun.gitSha} unavailable — replaying with current state`);
      }
    }
  }

  if (!ISSUE_ID_RE.test(originalRun.issueId)) {
    throw new Error(`invalid issueId in run: ${JSON.stringify(originalRun.issueId)}`);
  }

  const replayStartedAt = new Date();

  await new Promise<void>((resolve, reject) => {
    const child = spawn('forja', ['run', originalRun.issueId], { stdio: 'inherit' });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`forja run exited with code ${code}`));
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error('forja binary not found — ensure it is installed and on PATH'));
      else reject(err);
    });
  });

  const allRuns = await store.listRuns({ issueId: originalRun.issueId });
  const newRun = allRuns
    .filter((r) => r.id !== originalRun.id && new Date(r.startedAt) >= replayStartedAt)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

  if (!newRun) {
    throw new Error(`No new run found for issueId ${originalRun.issueId} after replay`);
  }

  const diffs = await compareRuns(store, options.runId, newRun.id, options.phases);
  return {
    originalRunId: options.runId,
    replayRunId: newRun.id,
    diffs,
    regression: hasRegression(diffs),
  };
}
