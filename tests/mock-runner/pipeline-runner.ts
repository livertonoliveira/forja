import { randomUUID } from 'crypto'
import { resolve, join } from 'path'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { PipelineFSM, type PipelineState } from '../../src/engine/fsm.js'
import { TraceWriter } from '../../src/trace/writer.js'
import { FindingWriter } from '../../src/trace/finding-writer.js'
import { CheckpointManager } from '../../src/engine/checkpoint.js'
import { readTrace } from '../../src/trace/reader.js'
import type { ForjaStore } from '../../src/store/interface.js'
import type { Run, Phase, Agent, Finding, TraceEvent } from '../../src/store/types.js'
import { ClaudeMock } from './claude-mock.js'

const TSX = resolve('node_modules/.bin/tsx')
const GATE_RUNNER = resolve('tests/e2e/_gate-runner.ts')
const PROJECT_ROOT = resolve('.')
const DEFAULT_FIXTURES_DIR = join(PROJECT_ROOT, 'tests', 'fixtures')

const QUALITY_PHASES = new Set<PipelineState>(['perf', 'security', 'review'])
const DEFAULT_PHASES: PipelineState[] = ['dev', 'test', 'perf', 'homolog', 'pr', 'done']

export interface PipelineRunConfig {
  issueId: string
  phases?: PipelineState[]
  fixturesDir?: string
  fixtureOverrides?: Partial<Record<string, string>>
  crashAt?: PipelineState
  resumeRunId?: string
}

export interface PhaseResult {
  phase: string
  status: 'success' | 'failed' | 'crashed'
  findingsCount: number
  durationMs: number
}

export interface GateResult {
  exitCode: number
  decision: 'pass' | 'warn' | 'fail'
}

export interface PipelineRunResult {
  success: boolean
  runId: string
  finalState: PipelineState
  phases: PhaseResult[]
  findings: Finding[]
  gateResult: GateResult | null
  traceEvents: TraceEvent[]
}

function makeInMemoryStore(initialRun?: Run): ForjaStore {
  const runs = new Map<string, Run>(initialRun ? [[initialRun.id, initialRun]] : [])
  const phases = new Map<string, Phase>()

  return {
    createRun: async (data) => {
      const run: Run = { ...data, id: randomUUID() }
      runs.set(run.id, run)
      return run
    },
    updateRun: async (id, data) => {
      const run = runs.get(id) ?? ({ id } as Run)
      const updated: Run = { ...run, ...data }
      runs.set(id, updated)
      return updated
    },
    getRun: async (id) => runs.get(id) ?? null,
    listRuns: async () => [...runs.values()],
    createPhase: async (data) => {
      const phase: Phase = { ...data, id: randomUUID() }
      phases.set(phase.id, phase)
      return phase
    },
    updatePhase: async (id, data) => {
      const phase = phases.get(id)
      if (!phase) {
        return { id, runId: '', name: '', startedAt: '', finishedAt: null, status: '' } as Phase
      }
      const updated: Phase = { ...phase, ...data }
      phases.set(id, updated)
      return updated
    },
    getPhase: async (id) => phases.get(id) ?? null,
    listPhases: async (runId) => [...phases.values()].filter((p) => p.runId === runId),
    createAgent: async (data): Promise<Agent> => ({
      ...data,
      id: randomUUID(),
    }),
    updateAgent: async (id, data): Promise<Agent> => ({
      id,
      runId: '',
      phaseId: '',
      name: '',
      model: '',
      spanId: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'completed',
      ...data,
    }),
    insertFinding: async (data) => ({ ...data, id: randomUUID() }),
    insertFindings: async (data) => data.map((d) => ({ ...d, id: randomUUID() })),
    listFindings: async () => [],
    insertToolCall: async (data) => ({ ...data, id: randomUUID() }),
    insertCostEvent: async (data) => ({ ...data, id: randomUUID() }),
    costSummaryByPhase: async () => [],
    insertGateDecision: async (data) => ({ ...data, id: randomUUID() }),
    getLatestGateDecision: async () => null,
    deletePhaseData: async () => {},
    linkIssue: async (data) => ({ ...data, id: randomUUID() }),
    listIssueLinks: async () => [],
    transitionRunStatus: async (id, expectedFrom, to) => {
      const run = runs.get(id)
      if (!run) throw new Error(`Run not found: ${id}`)
      if (run.status !== expectedFrom) {
        throw new Error(
          `concurrent transition: expected '${expectedFrom}' but found '${run.status}' for run ${id}`,
        )
      }
      const updated: Run = { ...run, status: to }
      runs.set(id, updated)
      return updated
    },
    deleteRunsBefore: async () => ({ runIds: [] }),
    ping: async () => {},
    close: async () => {},
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function runGateCli(runId: string): GateResult {
  if (!UUID_RE.test(runId)) throw new Error(`Invalid runId format: ${runId}`)
  const result = spawnSync(TSX, [GATE_RUNNER, '--run', runId], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: 10_000,
  })
  const exitCode = result.status ?? -1
  const decision: 'pass' | 'warn' | 'fail' =
    exitCode === 2 ? 'fail' : exitCode === 1 ? 'warn' : 'pass'
  return { exitCode, decision }
}

async function getLastCompletedPhase(runId: string): Promise<PipelineState | null> {
  const checkpointDir = join('forja', 'state', 'runs', runId, 'checkpoints')
  if (!existsSync(checkpointDir)) return null
  const phaseOrder: PipelineState[] = [
    'init', 'spec', 'dev', 'test', 'perf', 'security', 'review', 'homolog', 'pr', 'done',
  ]
  for (const phase of [...phaseOrder].reverse()) {
    if (existsSync(join(checkpointDir, `${phase}.json`))) return phase
  }
  return null
}

export async function runPipeline(config: PipelineRunConfig): Promise<PipelineRunResult> {
  const {
    issueId,
    phases = DEFAULT_PHASES,
    fixturesDir = DEFAULT_FIXTURES_DIR,
    fixtureOverrides = {},
    crashAt,
    resumeRunId,
  } = config

  let runId: string
  let store: ForjaStore
  let skipUntilAfter: PipelineState | null = null

  if (resumeRunId) {
    const lastCompleted = await getLastCompletedPhase(resumeRunId)
    skipUntilAfter = lastCompleted
    const initialRun: Run = {
      id: resumeRunId,
      issueId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: lastCompleted ?? 'init',
      gitBranch: null,
      gitSha: null,
      model: null,
      totalCost: '0',
      totalTokens: 0,
    }
    store = makeInMemoryStore(initialRun)
    runId = resumeRunId
  } else {
    store = makeInMemoryStore()
    const run = await store.createRun({
      issueId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'init',
      gitBranch: null,
      gitSha: null,
      model: null,
      totalCost: '0',
      totalTokens: 0,
    })
    runId = run.id
  }

  const fsm = new PipelineFSM(store, runId)
  const traceWriter = new TraceWriter(runId)
  const checkpointManager = new CheckpointManager(store, runId)

  const phaseResults: PhaseResult[] = []
  let gateResult: GateResult | null = null
  let skipMode = skipUntilAfter !== null

  try {
    for (const phase of phases) {
      // Resume: skip phases already completed in the previous run
      if (skipMode) {
        if (phase === skipUntilAfter) skipMode = false
        continue
      }

      if (phase === 'done') {
        await fsm.transition('done')
        break
      }

      const start = Date.now()
      const fixtureName = fixtureOverrides[phase] ?? `forja-${phase === 'dev' ? 'develop' : phase}`

      await traceWriter.writePhaseStart(phase)
      await fsm.transition(phase)

      const phaseRecord = await store.createPhase({
        runId,
        name: phase,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        status: 'running',
      })

      const mock = new ClaudeMock(fixturesDir, runId, phaseRecord.id)
      const agentResult = await mock.runPhase(fixtureName)

      await traceWriter.writePhaseEnd(phase, 'success')
      await traceWriter.writeCheckpoint(phase)
      await checkpointManager.save(phase, phaseRecord.id)

      phaseResults.push({
        phase,
        status: 'success',
        findingsCount: agentResult.findings.length,
        durationMs: Date.now() - start,
      })

      // Run gate after each quality phase
      if (QUALITY_PHASES.has(phase)) {
        gateResult = runGateCli(runId)
        if (gateResult.exitCode === 2) {
          return {
            success: false,
            runId,
            finalState: await fsm.getState(),
            phases: phaseResults,
            findings: await FindingWriter.readAll(runId),
            gateResult,
            traceEvents: await readTrace(runId).catch(() => []),
          }
        }
      }

      // Simulate crash after this phase's checkpoint
      if (crashAt === phase) {
        throw new Error(`Simulated crash at phase: ${phase}`)
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCrash = message.startsWith('Simulated crash')

    const lastPhaseResult = phaseResults[phaseResults.length - 1]
    if (lastPhaseResult && isCrash) {
      phaseResults[phaseResults.length - 1] = { ...lastPhaseResult, status: 'crashed' }
    }

    const finalState = await fsm.getState().catch(() => 'failed' as PipelineState)

    return {
      success: false,
      runId,
      finalState,
      phases: phaseResults,
      findings: await FindingWriter.readAll(runId),
      gateResult,
      traceEvents: await readTrace(runId).catch(() => []),
    }
  }

  return {
    success: true,
    runId,
    finalState: await fsm.getState(),
    phases: phaseResults,
    findings: await FindingWriter.readAll(runId),
    gateResult,
    traceEvents: await readTrace(runId),
  }
}
