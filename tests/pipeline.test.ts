import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import { runPipeline } from './mock-runner/pipeline-runner.js'

const createdRunIds: string[] = []

function runDir(runId: string): string {
  return path.join('forja', 'state', 'runs', runId)
}

afterEach(async () => {
  for (const runId of createdRunIds.splice(0)) {
    await fs.rm(runDir(runId), { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Scenario 1: Full pipeline pass — no critical findings → gate passes (exit 0)
// ---------------------------------------------------------------------------

describe('Pipeline: full run dev → test → perf → gate → homolog → pr → done (pass)', () => {
  it('FSM reaches done, gate passes, no findings', async () => {
    const result = await runPipeline({ issueId: 'MOB-987' })
    createdRunIds.push(result.runId)

    expect(result.success).toBe(true)
    expect(result.finalState).toBe('done')
    expect(result.phases.map((p) => p.phase)).toContain('dev')
    expect(result.phases.map((p) => p.phase)).toContain('test')
    expect(result.phases.map((p) => p.phase)).toContain('perf')
    expect(result.phases.every((p) => p.status === 'success')).toBe(true)
    expect(result.gateResult).not.toBeNull()
    expect(result.gateResult!.exitCode).toBe(0)
    expect(result.gateResult!.decision).toBe('pass')
    expect(result.findings).toHaveLength(0)

    // FSM state transitions produce phase_start + phase_end events in trace
    const phaseStartEvents = result.traceEvents.filter((e) => e.eventType === 'phase_start')
    const phaseEndEvents = result.traceEvents.filter((e) => e.eventType === 'phase_end')
    expect(phaseStartEvents.length).toBeGreaterThan(0)
    expect(phaseEndEvents.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Scenario 2: Gate fail — critical finding in perf fixture → gate fails (exit 2)
// ---------------------------------------------------------------------------

describe('Pipeline: gate fails when perf phase produces critical finding', () => {
  it('gate exits 2, pipeline stops, finding is in results', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      fixtureOverrides: { perf: 'forja-perf-critical' },
    })
    createdRunIds.push(result.runId)

    expect(result.success).toBe(false)
    expect(result.gateResult).not.toBeNull()
    expect(result.gateResult!.exitCode).toBe(2)
    expect(result.gateResult!.decision).toBe('fail')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('critical')
    expect(result.findings[0].title).toContain('SQL Injection')
  })
})

// ---------------------------------------------------------------------------
// Scenario 3: Resume — crash after dev, resume completes pipeline
// ---------------------------------------------------------------------------

describe('Pipeline: resume after crash at dev completes pipeline', () => {
  it('first run crashes at dev, second run resumes and reaches done', async () => {
    // First run: crash after dev
    const crashResult = await runPipeline({
      issueId: 'MOB-987',
      crashAt: 'dev',
    })
    createdRunIds.push(crashResult.runId)

    expect(crashResult.success).toBe(false)
    const devPhase = crashResult.phases.find((p) => p.phase === 'dev')
    expect(devPhase).toBeDefined()
    expect(devPhase!.status).toBe('crashed')

    // Second run: resume from crashed run
    const resumeResult = await runPipeline({
      issueId: 'MOB-987',
      resumeRunId: crashResult.runId,
    })
    // Resume re-uses same runId, no new cleanup needed

    expect(resumeResult.success).toBe(true)
    expect(resumeResult.finalState).toBe('done')
    expect(resumeResult.runId).toBe(crashResult.runId)
    expect(resumeResult.gateResult!.decision).toBe('pass')
  })
})

// ---------------------------------------------------------------------------
// Scenario 4: Hook events — PreToolUse, PostToolUse, Stop are exercised
// ---------------------------------------------------------------------------

describe('Pipeline: all hook types are exercised in trace', () => {
  it('trace contains PreToolUse (tool_call), PostToolUse (cost), and Stop (agent_end) events', async () => {
    const result = await runPipeline({
      issueId: 'MOB-987',
      phases: ['dev', 'done'],
    })
    createdRunIds.push(result.runId)

    // PreToolUse → tool_call events
    const toolCallEvents = result.traceEvents.filter((e) => e.eventType === 'tool_call')
    const preToolUseEvents = toolCallEvents.filter((e) => e.payload['hookType'] === 'PreToolUse')
    expect(preToolUseEvents.length).toBeGreaterThan(0)

    // PostToolUse → cost events
    const costEvents = result.traceEvents.filter((e) => e.eventType === 'cost')
    expect(costEvents.length).toBeGreaterThan(0)
    expect(costEvents[0].payload['model']).toBeTruthy()

    // Stop → agent_end with stopReason
    const agentEndEvents = result.traceEvents.filter((e) => e.eventType === 'agent_end')
    expect(agentEndEvents.length).toBeGreaterThan(0)
    expect(agentEndEvents[0].payload['stopReason']).toBe('end_turn')
  })
})
