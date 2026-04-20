import fs from 'fs/promises';
import path from 'path';
import type { Run, RunPhase } from './types';

export interface TraceEventRaw {
  ts: string;
  runId: string;
  phaseId?: string;
  agentId?: string;
  spanId?: string;
  eventType:
    | 'run_start'
    | 'run_end'
    | 'phase_start'
    | 'phase_end'
    | 'agent_start'
    | 'agent_end'
    | 'tool_call'
    | 'finding'
    | 'gate'
    | 'cost'
    | 'checkpoint'
    | 'error';
  commandFingerprint?: string;
  payload: Record<string, unknown>;
}

function getStateDir(): string {
  return (
    process.env.FORJA_STATE_DIR ??
    path.resolve(process.cwd(), '..', '..', 'forja', 'state')
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listRunIds(): Promise<string[]> {
  const runsDir = path.join(getStateDir(), 'runs');
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && UUID_RE.test(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function readRunEventsAll(runIds: string[]): Promise<TraceEventRaw[][]> {
  return pLimit(runIds.map((runId) => () => readRunEvents(runId)), 10);
}

const SUMMARY_EVENT_TYPES = new Set(['run_start', 'run_end', 'cost', 'gate']);

export async function readRunSummaryEvents(runId: string): Promise<TraceEventRaw[]> {
  if (!UUID_RE.test(runId)) return [];
  const stateDir = getStateDir();
  const runsDir = path.join(stateDir, 'runs');
  const tracePath = path.join(runsDir, runId, 'trace.jsonl');
  const resolved = path.resolve(tracePath);
  if (!resolved.startsWith(path.resolve(runsDir))) return [];
  try {
    const content = await fs.readFile(tracePath, 'utf-8');
    const events: TraceEventRaw[] = [];
    let seenRunEnd = false;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as TraceEventRaw;
        if (SUMMARY_EVENT_TYPES.has(event.eventType)) {
          events.push(event);
        }
        if (event.eventType === 'run_end') {
          seenRunEnd = true;
          break;
        }
      } catch {
        // skip malformed lines
      }
    }
    // If run_end not yet seen the run is still in progress — keep partial events
    void seenRunEnd;
    return events;
  } catch {
    return [];
  }
}

export async function readRunSummaryEventsAll(runIds: string[]): Promise<TraceEventRaw[][]> {
  return pLimit(runIds.map((runId) => () => readRunSummaryEvents(runId)), 10);
}

export async function readRunEvents(runId: string): Promise<TraceEventRaw[]> {
  if (!UUID_RE.test(runId)) return [];
  const stateDir = getStateDir();
  const runsDir = path.join(stateDir, 'runs');
  const tracePath = path.join(runsDir, runId, 'trace.jsonl');
  const resolved = path.resolve(tracePath);
  if (!resolved.startsWith(path.resolve(runsDir))) return [];
  try {
    const content = await fs.readFile(tracePath, 'utf-8');
    const events: TraceEventRaw[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as TraceEventRaw);
      } catch {
        // skip malformed lines
      }
    }
    return events;
  } catch {
    return [];
  }
}

export function buildRunFromEvents(runId: string, events: TraceEventRaw[]): Run {
  const runStart = events.find((e) => e.eventType === 'run_start');
  const runEnd = events.find((e) => e.eventType === 'run_end');

  const issueId = (runStart?.payload?.issueId as string | undefined) ?? '';
  const startedAt = runStart?.ts ?? new Date(0).toISOString();

  const finishedAt = runEnd?.ts ?? null;
  const status =
    runEnd != null
      ? ((runEnd.payload?.status as string | undefined) ?? 'done')
      : 'in_progress';

  let totalTokens = 0;
  let totalCostRaw = 0;

  for (const event of events) {
    if (event.eventType !== 'cost') continue;
    const tokensIn = Number(event.payload?.tokensIn ?? 0);
    const tokensOut = Number(event.payload?.tokensOut ?? 0);
    const costUsd = Number(event.payload?.costUsd ?? 0);
    totalTokens += tokensIn + tokensOut;
    totalCostRaw += isNaN(costUsd) ? 0 : costUsd;
  }

  const totalCostUsd = totalCostRaw.toFixed(6);

  const gateEvents = events.filter((e) => e.eventType === 'gate');
  const lastGate = gateEvents[gateEvents.length - 1];
  const gateFinal =
    (lastGate?.payload?.decision as 'pass' | 'warn' | 'fail' | undefined) ??
    null;

  return {
    id: runId,
    issueId,
    status,
    startedAt,
    finishedAt,
    totalTokens,
    totalCostUsd,
    gateFinal,
  };
}

export function buildPhasesFromEvents(events: TraceEventRaw[]): RunPhase[] {
  // Collect phase names in order of first appearance
  const phaseOrder: string[] = [];
  const phaseStartTs: Record<string, string> = {};
  const phaseEndTs: Record<string, string> = {};
  const phaseTokensIn: Record<string, number> = {};
  const phaseTokensOut: Record<string, number> = {};
  const phaseCostRaw: Record<string, number> = {};
  const phaseGate: Record<string, 'pass' | 'warn' | 'fail' | null> = {};

  for (const event of events) {
    if (event.eventType === 'phase_start') {
      const phase = (event.payload?.phase as string | undefined) ?? event.phaseId ?? 'unknown';
      if (!phaseOrder.includes(phase)) {
        phaseOrder.push(phase);
        phaseTokensIn[phase] = 0;
        phaseTokensOut[phase] = 0;
        phaseCostRaw[phase] = 0;
        phaseGate[phase] = null;
      }
      phaseStartTs[phase] = event.ts;
    }

    if (event.eventType === 'phase_end') {
      const phase = (event.payload?.phase as string | undefined) ?? event.phaseId ?? 'unknown';
      if (!phaseOrder.includes(phase)) {
        phaseOrder.push(phase);
        phaseTokensIn[phase] = 0;
        phaseTokensOut[phase] = 0;
        phaseCostRaw[phase] = 0;
        phaseGate[phase] = null;
      }
      phaseEndTs[phase] = event.ts;
    }

    if (event.eventType === 'cost') {
      // phaseId on the event itself is the UUID; payload may have a human-readable phase name
      const phase =
        (event.payload?.phase as string | undefined) ??
        event.phaseId ??
        'unknown';
      if (!phaseOrder.includes(phase)) {
        phaseOrder.push(phase);
        phaseTokensIn[phase] = 0;
        phaseTokensOut[phase] = 0;
        phaseCostRaw[phase] = 0;
        phaseGate[phase] = null;
      }
      phaseTokensIn[phase] += Number(event.payload?.tokensIn ?? 0);
      phaseTokensOut[phase] += Number(event.payload?.tokensOut ?? 0);
      const cost = Number(event.payload?.costUsd ?? 0);
      phaseCostRaw[phase] += isNaN(cost) ? 0 : cost;
    }

    if (event.eventType === 'gate') {
      const phase =
        (event.payload?.phase as string | undefined) ??
        event.phaseId ??
        'unknown';
      if (!phaseOrder.includes(phase)) {
        phaseOrder.push(phase);
        phaseTokensIn[phase] = 0;
        phaseTokensOut[phase] = 0;
        phaseCostRaw[phase] = 0;
        phaseGate[phase] = null;
      }
      const decision = event.payload?.decision as 'pass' | 'warn' | 'fail' | undefined;
      if (decision != null) {
        phaseGate[phase] = decision;
      }
    }
  }

  return phaseOrder.map((phase) => ({
    phase,
    startedAt: phaseStartTs[phase] ?? new Date(0).toISOString(),
    finishedAt: phaseEndTs[phase] ?? null,
    tokensIn: phaseTokensIn[phase] ?? 0,
    tokensOut: phaseTokensOut[phase] ?? 0,
    costUsd: (phaseCostRaw[phase] ?? 0).toFixed(6),
    gate: phaseGate[phase] ?? null,
  }));
}
