import { randomUUID } from 'crypto'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import { TraceWriter } from '../../src/trace/writer.js'
import { FindingWriter } from '../../src/trace/finding-writer.js'
import { generateSpanId } from '../../src/trace/span.js'

export interface ToolCallFixture {
  tool: string
  durationMs?: number
}

export interface FindingFixture {
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  filePath?: string
  line?: number
  suggestion?: string
  owasp?: string
  cwe?: string
}

export interface HookEventFixture {
  type: 'PreToolUse' | 'PostToolUse' | 'Stop'
  tool?: string
  blocked?: boolean
  tokensIn?: number
  tokensOut?: number
  model?: string
  reason?: string
}

export interface PhaseFixture {
  output: Record<string, unknown>
  toolCalls: ToolCallFixture[]
  findings: FindingFixture[]
  hookEvents: HookEventFixture[]
}

export interface MockAgentResult {
  spanId: string
  agentId: string
  findings: FindingFixture[]
  toolCalls: ToolCallFixture[]
  hookEvents: HookEventFixture[]
}

function parseJsonFile<T>(filePath: string): T {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export class ClaudeMock {
  private traceWriter: TraceWriter

  constructor(
    private fixturesDir: string,
    private runId: string,
    private phaseId: string,
  ) {
    this.traceWriter = new TraceWriter(runId)
  }

  loadFixture(fixtureName: string): PhaseFixture {
    // Prevent path traversal: fixture name must be a simple identifier (no slashes or dots)
    if (!/^[\w-]+$/.test(fixtureName)) {
      throw new Error(`Invalid fixture name: ${JSON.stringify(fixtureName)}`)
    }

    const fixtureDir = join(this.fixturesDir, fixtureName)
    const outputPath = join(fixtureDir, 'output.json')
    const toolCallsPath = join(fixtureDir, 'tool-calls.json')

    const output = existsSync(outputPath)
      ? parseJsonFile<Record<string, unknown>>(outputPath)
      : {}

    const toolCalls = existsSync(toolCallsPath)
      ? parseJsonFile<ToolCallFixture[]>(toolCallsPath)
      : []

    const findings = Array.isArray(output['findings'])
      ? (output['findings'] as FindingFixture[])
      : []

    const hookEvents = Array.isArray(output['hookEvents'])
      ? (output['hookEvents'] as HookEventFixture[])
      : []

    return { output, toolCalls, findings, hookEvents }
  }

  async runPhase(fixtureName: string): Promise<MockAgentResult> {
    const spanId = generateSpanId()
    const agentId = randomUUID()
    const fixture = this.loadFixture(fixtureName)

    await this.traceWriter.write({
      runId: this.runId,
      eventType: 'agent_start',
      spanId,
      agentId,
      phaseId: this.phaseId,
      payload: { phase: fixtureName },
    })

    // Simulate PreToolUse hooks
    for (const hook of fixture.hookEvents.filter((h) => h.type === 'PreToolUse')) {
      await this.traceWriter.write({
        runId: this.runId,
        eventType: 'tool_call',
        spanId,
        agentId,
        phaseId: this.phaseId,
        payload: {
          tool: hook.tool ?? 'unknown',
          durationMs: 0,
          hookType: 'PreToolUse',
          blocked: hook.blocked ?? false,
        },
      })
    }

    // Simulate tool calls
    for (const tc of fixture.toolCalls) {
      await this.traceWriter.writeToolCall(tc.tool, agentId, tc.durationMs ?? 50, spanId)
    }

    // Simulate PostToolUse hooks as cost events
    for (const hook of fixture.hookEvents.filter((h) => h.type === 'PostToolUse')) {
      await this.traceWriter.write({
        runId: this.runId,
        eventType: 'cost',
        spanId,
        agentId,
        phaseId: this.phaseId,
        payload: {
          model: hook.model ?? 'claude-opus-4-7',
          tokensIn: hook.tokensIn ?? 100,
          tokensOut: hook.tokensOut ?? 50,
          costUsd: String(
            (hook.tokensIn ?? 100) * 0.000015 + (hook.tokensOut ?? 50) * 0.000075,
          ),
        },
      })
    }

    // Write findings via FindingWriter if present
    if (fixture.findings.length > 0) {
      const findingWriter = new FindingWriter(this.runId, this.phaseId, this.traceWriter)
      for (const f of fixture.findings) {
        findingWriter.write(f)
      }
      await findingWriter.flush()
    }

    // Simulate Stop hook as agent_end
    const stopReason = fixture.hookEvents.find((h) => h.type === 'Stop')?.reason ?? 'end_turn'
    await this.traceWriter.write({
      runId: this.runId,
      eventType: 'agent_end',
      spanId,
      agentId,
      phaseId: this.phaseId,
      payload: { phase: fixtureName, status: 'success', stopReason },
    })

    return {
      spanId,
      agentId,
      findings: fixture.findings,
      toolCalls: fixture.toolCalls,
      hookEvents: fixture.hookEvents,
    }
  }
}
