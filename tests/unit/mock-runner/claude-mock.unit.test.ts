/**
 * Unit tests for tests/mock-runner/claude-mock.ts
 *
 * Coverage:
 * - loadFixture(): happy path, missing output.json, missing tool-calls.json,
 *   hookEvents extracted from output, findings extracted from output
 * - runPhase(): PreToolUse hook → tool_call events, regular tool calls,
 *   PostToolUse hook → cost events, Stop hook → agent_end with stopReason,
 *   findings written via FindingWriter, returns correct MockAgentResult shape
 */

import { describe, it, expect, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { ClaudeMock } from '../../mock-runner/claude-mock.js'
import { readTrace } from '../../../src/trace/reader.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve('.')
const TMP_FIXTURES = path.join(PROJECT_ROOT, 'forja', 'state', '__test-fixtures__')
const REAL_FIXTURES = path.join(PROJECT_ROOT, 'tests', 'fixtures')

const createdRunIds: string[] = []

function makeRunId(): string {
  const id = randomUUID()
  createdRunIds.push(id)
  return id
}

async function writeFixture(fixtureName: string, outputData: object, toolCallsData?: object[]): Promise<void> {
  const fixtureDir = path.join(TMP_FIXTURES, fixtureName)
  await fs.mkdir(fixtureDir, { recursive: true })
  await fs.writeFile(path.join(fixtureDir, 'output.json'), JSON.stringify(outputData), 'utf-8')
  if (toolCallsData !== undefined) {
    await fs.writeFile(path.join(fixtureDir, 'tool-calls.json'), JSON.stringify(toolCallsData), 'utf-8')
  }
}

async function cleanupRun(runId: string): Promise<void> {
  await fs.rm(path.join(PROJECT_ROOT, 'forja', 'state', 'runs', runId), {
    recursive: true,
    force: true,
  })
}

afterEach(async () => {
  await Promise.all(createdRunIds.splice(0).map(cleanupRun))
  await fs.rm(TMP_FIXTURES, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// loadFixture()
// ---------------------------------------------------------------------------

describe('ClaudeMock.loadFixture()', () => {
  it('loads output and toolCalls from valid fixture directory', async () => {
    await writeFixture('test-load', { key: 'value' }, [{ tool: 'Read', durationMs: 30 }])
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    const fixture = mock.loadFixture('test-load')

    expect(fixture.output).toMatchObject({ key: 'value' })
    expect(fixture.toolCalls).toHaveLength(1)
    expect(fixture.toolCalls[0].tool).toBe('Read')
    expect(fixture.toolCalls[0].durationMs).toBe(30)
  })

  it('returns empty toolCalls when tool-calls.json is absent', async () => {
    await writeFixture('test-no-tool-calls', { summary: 'no tools' })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    const fixture = mock.loadFixture('test-no-tool-calls')

    expect(fixture.toolCalls).toEqual([])
  })

  it('returns empty output when output.json is absent', async () => {
    const fixtureDir = path.join(TMP_FIXTURES, 'test-no-output')
    await fs.mkdir(fixtureDir, { recursive: true })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    const fixture = mock.loadFixture('test-no-output')

    expect(fixture.output).toEqual({})
    expect(fixture.findings).toEqual([])
    expect(fixture.hookEvents).toEqual([])
  })

  it('extracts findings array from output.json', async () => {
    await writeFixture('test-findings', {
      findings: [
        {
          severity: 'critical',
          category: 'security',
          title: 'SQL Injection',
          description: 'Unparameterized query',
        },
      ],
    })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    const fixture = mock.loadFixture('test-findings')

    expect(fixture.findings).toHaveLength(1)
    expect(fixture.findings[0].severity).toBe('critical')
    expect(fixture.findings[0].title).toBe('SQL Injection')
  })

  it('extracts hookEvents array from output.json', async () => {
    await writeFixture('test-hooks', {
      hookEvents: [
        { type: 'PreToolUse', tool: 'Read', blocked: false },
        { type: 'Stop', reason: 'end_turn' },
      ],
    })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    const fixture = mock.loadFixture('test-hooks')

    expect(fixture.hookEvents).toHaveLength(2)
    expect(fixture.hookEvents[0].type).toBe('PreToolUse')
    expect(fixture.hookEvents[1].type).toBe('Stop')
  })

  it('returns empty findings and hookEvents when output.json has no arrays', async () => {
    await writeFixture('test-empty-arrays', { summary: 'clean' })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    const fixture = mock.loadFixture('test-empty-arrays')

    expect(fixture.findings).toEqual([])
    expect(fixture.hookEvents).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// runPhase()
// ---------------------------------------------------------------------------

describe('ClaudeMock.runPhase() — returns correct MockAgentResult shape', () => {
  it('returns spanId, agentId, findings, toolCalls, hookEvents from fixture', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    const result = await mock.runPhase('forja-develop')

    expect(result.spanId).toBeTruthy()
    expect(result.agentId).toBeTruthy()
    expect(result.findings).toEqual([])
    expect(result.toolCalls).toHaveLength(3) // Read, Write, Bash
    expect(result.hookEvents.length).toBeGreaterThan(0)
  })

  it('writes agent_start and agent_end events to trace', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    await mock.runPhase('forja-develop')

    const events = await readTrace(runId)
    const startEvents = events.filter((e) => e.eventType === 'agent_start')
    const endEvents = events.filter((e) => e.eventType === 'agent_end')
    expect(startEvents).toHaveLength(1)
    expect(endEvents).toHaveLength(1)
  })
})

describe('ClaudeMock.runPhase() — PreToolUse hook simulation', () => {
  it('emits tool_call events with hookType=PreToolUse for each PreToolUse hook', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    await mock.runPhase('forja-develop')

    const events = await readTrace(runId)
    const preToolUseEvents = events.filter(
      (e) => e.eventType === 'tool_call' && e.payload['hookType'] === 'PreToolUse',
    )
    // forja-develop fixture has 2 PreToolUse hooks (Read, Write)
    expect(preToolUseEvents.length).toBeGreaterThanOrEqual(2)
    for (const e of preToolUseEvents) {
      expect(e.payload['blocked']).toBe(false)
    }
  })

  it('records blocked=true when fixture hook has blocked:true', async () => {
    await writeFixture('test-blocked', {
      hookEvents: [{ type: 'PreToolUse', tool: 'Write', blocked: true }],
    })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    await mock.runPhase('test-blocked')

    const events = await readTrace(runId)
    const blocked = events.find(
      (e) => e.eventType === 'tool_call' && e.payload['blocked'] === true,
    )
    expect(blocked).toBeDefined()
  })
})

describe('ClaudeMock.runPhase() — regular tool call simulation', () => {
  it('emits tool_call events for each entry in tool-calls.json', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    await mock.runPhase('forja-develop')

    const events = await readTrace(runId)
    // Regular tool_calls have no hookType field
    const regularToolCalls = events.filter(
      (e) => e.eventType === 'tool_call' && e.payload['hookType'] === undefined,
    )
    expect(regularToolCalls).toHaveLength(3) // Read, Write, Bash
  })
})

describe('ClaudeMock.runPhase() — PostToolUse hook simulation', () => {
  it('emits cost events for each PostToolUse hook', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    await mock.runPhase('forja-develop')

    const events = await readTrace(runId)
    const costEvents = events.filter((e) => e.eventType === 'cost')
    // forja-develop fixture has 2 PostToolUse hooks
    expect(costEvents).toHaveLength(2)
    for (const e of costEvents) {
      expect(e.payload['model']).toBe('claude-opus-4-7')
      expect(typeof e.payload['tokensIn']).toBe('number')
      expect(typeof e.payload['tokensOut']).toBe('number')
    }
  })

  it('calculates costUsd as a string based on token counts', async () => {
    await writeFixture('test-cost', {
      hookEvents: [
        { type: 'PostToolUse', tool: 'Read', tokensIn: 100, tokensOut: 50, model: 'claude-opus-4-7' },
      ],
    })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    await mock.runPhase('test-cost')

    const events = await readTrace(runId)
    const costEvent = events.find((e) => e.eventType === 'cost')
    expect(costEvent).toBeDefined()
    const costStr = costEvent!.payload['costUsd'] as string
    // (100 * 0.000015 + 50 * 0.000075) = 0.0015 + 0.00375 = 0.00525
    expect(parseFloat(costStr)).toBeCloseTo(0.00525, 5)
  })
})

describe('ClaudeMock.runPhase() — Stop hook simulation', () => {
  it('agent_end event has stopReason=end_turn by default', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    await mock.runPhase('forja-develop')

    const events = await readTrace(runId)
    const agentEnd = events.find((e) => e.eventType === 'agent_end')
    expect(agentEnd).toBeDefined()
    expect(agentEnd!.payload['stopReason']).toBe('end_turn')
  })

  it('uses custom stopReason from Stop hook when present', async () => {
    await writeFixture('test-stop-reason', {
      hookEvents: [{ type: 'Stop', reason: 'max_tokens' }],
    })
    const runId = makeRunId()
    const mock = new ClaudeMock(TMP_FIXTURES, runId, randomUUID())

    await mock.runPhase('test-stop-reason')

    const events = await readTrace(runId)
    const agentEnd = events.find((e) => e.eventType === 'agent_end')
    expect(agentEnd).toBeDefined()
    expect(agentEnd!.payload['stopReason']).toBe('max_tokens')
  })
})

describe('ClaudeMock.runPhase() — finding writing', () => {
  it('writes findings to findings.json via FindingWriter when fixture has findings', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    const result = await mock.runPhase('forja-perf-critical')

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('critical')
    expect(result.findings[0].title).toContain('SQL Injection')

    // Verify findings.json was actually written
    const findingsPath = path.join(PROJECT_ROOT, 'forja', 'state', 'runs', runId, 'findings.json')
    const raw = await fs.readFile(findingsPath, 'utf-8')
    const parsed = JSON.parse(raw) as Array<{ severity: string; title: string }>
    expect(parsed).toHaveLength(1)
    expect(parsed[0].severity).toBe('critical')
  })

  it('does not write findings.json when fixture has no findings', async () => {
    const runId = makeRunId()
    const phaseId = randomUUID()
    const mock = new ClaudeMock(REAL_FIXTURES, runId, phaseId)

    await mock.runPhase('forja-develop')

    const findingsPath = path.join(PROJECT_ROOT, 'forja', 'state', 'runs', runId, 'findings.json')
    const exists = await fs.access(findingsPath).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })
})
