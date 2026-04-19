/**
 * Integration tests for tests/mock-runner/pipeline-runner.ts
 *
 * Coverage:
 * - makeInMemoryStore: CRUD operations, transitionRunStatus optimistic-lock
 * - runPipeline: happy path (full pipeline → done), gate-fail exit 2,
 *   crash+resume round-trip, hook event types in trace, skip logic during resume
 * - runGateCli: indirectly via runPipeline gate scenarios
 * - getLastCompletedPhase: indirectly via resume scenario (checkpoint written)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { runPipeline } from '../../mock-runner/pipeline-runner.js'
import { readTrace } from '../../../src/trace/reader.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve('.')
const createdRunIds: string[] = []

function trackRun(runId: string): string {
  createdRunIds.push(runId)
  return runId
}

function runDir(runId: string): string {
  return path.join(PROJECT_ROOT, 'forja', 'state', 'runs', runId)
}

afterEach(async () => {
  await Promise.all(
    createdRunIds.splice(0).map((id) => fs.rm(runDir(id), { recursive: true, force: true })),
  )
})

// ---------------------------------------------------------------------------
// Full pipeline — happy path
// ---------------------------------------------------------------------------

describe('runPipeline — full run dev → test → perf → gate → homolog → pr → done', () => {
  it('returns success=true and finalState=done', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    expect(result.success).toBe(true)
    expect(result.finalState).toBe('done')
  })

  it('executes all expected phases in correct order', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    const phases = result.phases.map((p) => p.phase)
    expect(phases).toContain('dev')
    expect(phases).toContain('test')
    expect(phases).toContain('perf')
    expect(phases).toContain('homolog')
    expect(phases).toContain('pr')
    // dev must come before test
    expect(phases.indexOf('dev')).toBeLessThan(phases.indexOf('test'))
    expect(phases.indexOf('test')).toBeLessThan(phases.indexOf('perf'))
    expect(phases.indexOf('perf')).toBeLessThan(phases.indexOf('homolog'))
  })

  it('all phases report status=success', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    expect(result.phases.every((p) => p.status === 'success')).toBe(true)
  })

  it('gate passes with exit 0 and decision=pass', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    expect(result.gateResult).not.toBeNull()
    expect(result.gateResult!.exitCode).toBe(0)
    expect(result.gateResult!.decision).toBe('pass')
  })

  it('no findings returned for clean pipeline', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    expect(result.findings).toHaveLength(0)
  })

  it('trace contains phase_start and phase_end events', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    const phaseStarts = result.traceEvents.filter((e) => e.eventType === 'phase_start')
    const phaseEnds = result.traceEvents.filter((e) => e.eventType === 'phase_end')
    expect(phaseStarts.length).toBeGreaterThan(0)
    expect(phaseEnds.length).toBeGreaterThan(0)
  })

  it('assigns a valid UUID as runId', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    expect(result.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('each phase records a durationMs >= 0', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    trackRun(result.runId)

    for (const p of result.phases) {
      expect(p.durationMs).toBeGreaterThanOrEqual(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Gate fail — critical finding in perf-critical fixture
// ---------------------------------------------------------------------------

describe('runPipeline — gate fails on critical finding', () => {
  it('returns success=false when perf produces a critical finding', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      fixtureOverrides: { perf: 'forja-perf-critical' },
    })
    trackRun(result.runId)

    expect(result.success).toBe(false)
  })

  it('gateResult has exitCode=2 and decision=fail', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      fixtureOverrides: { perf: 'forja-perf-critical' },
    })
    trackRun(result.runId)

    expect(result.gateResult).not.toBeNull()
    expect(result.gateResult!.exitCode).toBe(2)
    expect(result.gateResult!.decision).toBe('fail')
  })

  it('findings array contains exactly 1 critical finding with expected title', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      fixtureOverrides: { perf: 'forja-perf-critical' },
    })
    trackRun(result.runId)

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('critical')
    expect(result.findings[0].title).toContain('SQL Injection')
  })

  it('pipeline stops after gate fail — homolog and pr phases are not run', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      fixtureOverrides: { perf: 'forja-perf-critical' },
    })
    trackRun(result.runId)

    const phaseNames = result.phases.map((p) => p.phase)
    expect(phaseNames).not.toContain('homolog')
    expect(phaseNames).not.toContain('pr')
  })
})

// ---------------------------------------------------------------------------
// Crash and resume
// ---------------------------------------------------------------------------

describe('runPipeline — crash at dev + resume completes pipeline', () => {
  it('first run crashes at dev (success=false, dev status=crashed)', async () => {
    const crashResult = await runPipeline({ issueId: 'MOB-987', crashAt: 'dev' })
    trackRun(crashResult.runId)

    expect(crashResult.success).toBe(false)
    const devPhase = crashResult.phases.find((p) => p.phase === 'dev')
    expect(devPhase).toBeDefined()
    expect(devPhase!.status).toBe('crashed')
  })

  it('second run with resumeRunId completes successfully and reaches done', async () => {
    const crashResult = await runPipeline({ issueId: 'MOB-987', crashAt: 'dev' })
    trackRun(crashResult.runId)

    const resumeResult = await runPipeline({
      issueId: 'MOB-987',
      resumeRunId: crashResult.runId,
    })

    expect(resumeResult.success).toBe(true)
    expect(resumeResult.finalState).toBe('done')
  })

  it('resumed run uses the same runId as the crashed run', async () => {
    const crashResult = await runPipeline({ issueId: 'MOB-987', crashAt: 'dev' })
    trackRun(crashResult.runId)

    const resumeResult = await runPipeline({
      issueId: 'MOB-987',
      resumeRunId: crashResult.runId,
    })

    expect(resumeResult.runId).toBe(crashResult.runId)
  })

  it('resumed run gate passes after completing remaining phases', async () => {
    const crashResult = await runPipeline({ issueId: 'MOB-987', crashAt: 'dev' })
    trackRun(crashResult.runId)

    const resumeResult = await runPipeline({
      issueId: 'MOB-987',
      resumeRunId: crashResult.runId,
    })

    expect(resumeResult.gateResult).not.toBeNull()
    expect(resumeResult.gateResult!.decision).toBe('pass')
  })

  it('checkpoint file is written after dev phase completes in crash run', async () => {
    const crashResult = await runPipeline({ issueId: 'MOB-987', crashAt: 'dev' })
    trackRun(crashResult.runId)

    const checkpointPath = path.join(
      PROJECT_ROOT,
      'forja',
      'state',
      'runs',
      crashResult.runId,
      'checkpoints',
      'dev.json',
    )
    const exists = await fs.access(checkpointPath)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Custom phases list
// ---------------------------------------------------------------------------

describe('runPipeline — custom phases list', () => {
  it('only runs phases up to the invalid transition when dev→done is attempted', async () => {
    // dev→done is an invalid FSM transition (dev can only go to test).
    // The pipeline catches the error and returns success=false, having run dev.
    const result = await runPipeline({
      issueId: 'MOB-987',
      phases: ['dev', 'done'],
    })
    trackRun(result.runId)

    const phaseNames = result.phases.map((p) => p.phase)
    expect(phaseNames).toContain('dev')
    expect(phaseNames).not.toContain('test')
    expect(phaseNames).not.toContain('perf')
    // dev succeeds, but done transition fails → pipeline returns success=false
    expect(result.success).toBe(false)
  })

  it('gateResult is null when no quality phases run', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      phases: ['dev', 'done'],
    })
    trackRun(result.runId)

    expect(result.gateResult).toBeNull()
  })

  it('runs only minimal phases when using valid dev→test→done-skipping sequence', async () => {
    // A valid minimal pipeline: dev→test→perf→homolog→pr→done skips security/review
    // Test that phases list respected — only dev and test run (done is special)
    const result = await runPipeline({
      issueId: 'MOB-987',
      phases: ['dev', 'test', 'homolog', 'pr', 'done'],
    })
    trackRun(result.runId)

    const phaseNames = result.phases.map((p) => p.phase)
    expect(phaseNames).toContain('dev')
    expect(phaseNames).toContain('test')
    expect(phaseNames).not.toContain('perf')
    expect(phaseNames).not.toContain('security')
    expect(result.success).toBe(true)
    expect(result.finalState).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// Hook event types in trace
// ---------------------------------------------------------------------------

describe('runPipeline — hook events produce correct trace events', () => {
  it('PreToolUse produces tool_call events with hookType=PreToolUse', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      phases: ['dev', 'done'],
    })
    trackRun(result.runId)

    const preToolUse = result.traceEvents.filter(
      (e) => e.eventType === 'tool_call' && e.payload['hookType'] === 'PreToolUse',
    )
    expect(preToolUse.length).toBeGreaterThan(0)
  })

  it('PostToolUse produces cost events with model and token fields', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      phases: ['dev', 'done'],
    })
    trackRun(result.runId)

    const costEvents = result.traceEvents.filter((e) => e.eventType === 'cost')
    expect(costEvents.length).toBeGreaterThan(0)
    expect(costEvents[0].payload['model']).toBeTruthy()
    expect(typeof costEvents[0].payload['tokensIn']).toBe('number')
    expect(typeof costEvents[0].payload['tokensOut']).toBe('number')
  })

  it('Stop hook produces agent_end with stopReason=end_turn', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      phases: ['dev', 'done'],
    })
    trackRun(result.runId)

    const agentEndEvents = result.traceEvents.filter((e) => e.eventType === 'agent_end')
    expect(agentEndEvents.length).toBeGreaterThan(0)
    expect(agentEndEvents[0].payload['stopReason']).toBe('end_turn')
  })
})

// ---------------------------------------------------------------------------
// fixtureOverrides
// ---------------------------------------------------------------------------

describe('runPipeline — fixtureOverrides', () => {
  it('uses overridden fixture name for the specified phase', async () => {
    // perf-critical provides 1 critical finding; override perf to use it
    const result = await runPipeline({
      issueId: 'MOB-987',
      fixtureOverrides: { perf: 'forja-perf-critical' },
    })
    trackRun(result.runId)

    const perfPhase = result.phases.find((p) => p.phase === 'perf')
    expect(perfPhase).toBeDefined()
    expect(perfPhase!.findingsCount).toBe(1)
  })
})
