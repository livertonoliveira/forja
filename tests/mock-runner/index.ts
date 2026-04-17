import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface FixtureResult {
  command: string
  passed: boolean
  errors: string[]
}

export interface FixtureData {
  input: unknown
  output: unknown
  expected: Record<string, unknown>
}

type ValidatorFn = (input: unknown, output: unknown, expected: Record<string, unknown>) => string[]

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function formatDiff(expected: unknown, actual: unknown): string {
  return `Expected:\n${JSON.stringify(expected, null, 2)}\nActual:\n${JSON.stringify(actual, null, 2)}`
}

function validateTraceEvents(output: unknown, expected: Record<string, unknown>): string[] {
  const traceExpected = expected['trace-events'] as Array<{ type: string }> | undefined
  if (!traceExpected) return []

  const out = output as { traceEvents?: Array<{ type: string }> }
  const actualTypes = (out.traceEvents ?? []).map((e) => e.type)
  const expectedTypes = traceExpected.map((e) => e.type)
  const missing = expectedTypes.filter((t) => !actualTypes.includes(t))

  if (missing.length > 0) {
    return [formatDiff({ traceEventTypes: expectedTypes }, { traceEventTypes: actualTypes })]
  }
  return []
}

function validateForjaSpec(
  _input: unknown,
  output: unknown,
  expected: Record<string, unknown>
): string[] {
  const errors: string[] = []
  const outputStr = JSON.stringify(output)
  if (!/REQ-\d+/.test(outputStr)) {
    errors.push(
      formatDiff(
        'Output containing REQ-\\d+ pattern',
        `Output without REQ-\\d+ pattern: ${outputStr.slice(0, 200)}`
      )
    )
  }
  errors.push(...validateTraceEvents(output, expected))
  return errors
}

function validateForjaGate(
  input: unknown,
  output: unknown,
  _expected: Record<string, unknown>
): string[] {
  const inp = input as { findings?: Array<{ severity: string }> }
  const out = output as { exitCode?: number }
  const findings = inp.findings ?? []

  const hasCriticalOrHigh = findings.some(
    (f) => f.severity === 'critical' || f.severity === 'high'
  )
  const hasMedium = findings.some((f) => f.severity === 'medium')
  const expectedExitCode = hasCriticalOrHigh ? 2 : hasMedium ? 1 : 0

  if (out.exitCode !== expectedExitCode) {
    return [formatDiff({ exitCode: expectedExitCode }, { exitCode: out.exitCode })]
  }
  return []
}

function validateForjaDevelop(
  _input: unknown,
  output: unknown,
  expected: Record<string, unknown>
): string[] {
  const errors = validateTraceEvents(output, expected)
  if (errors.length > 0) return errors

  const out = output as { traceEvents?: Array<{ type: string }> }
  const traceEvents = out.traceEvents ?? []
  const hasPhaseStart = traceEvents.some((e) => e.type === 'phase_start')
  const hasPhaseEnd = traceEvents.some((e) => e.type === 'phase_end')

  if (!hasPhaseStart || !hasPhaseEnd) {
    return [
      formatDiff(
        { traceEvents: [{ type: 'phase_start' }, { type: 'phase_end' }] },
        { traceEvents: traceEvents }
      ),
    ]
  }
  return []
}

// Validator registry — add an entry here to support a new command without modifying runFixture
const validators: Record<string, ValidatorFn> = {
  'forja-spec': validateForjaSpec,
  'forja-gate': validateForjaGate,
  'forja-develop': validateForjaDevelop,
}

function loadExpected(commandDir: string): Record<string, unknown> {
  const expectedDir = join(commandDir, 'expected')
  if (!existsSync(expectedDir)) return {}
  return Object.fromEntries(
    readdirSync(expectedDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.replace('.json', ''), readJson(join(expectedDir, f))])
  )
}

export function loadFixtureData(fixturesDir: string, commandName: string): FixtureData {
  const commandDir = join(fixturesDir, commandName)
  return {
    input: readJson(join(commandDir, 'input.json')),
    output: readJson(join(commandDir, 'output.json')),
    expected: loadExpected(commandDir),
  }
}

export function runFixture(fixturesDir: string, commandName: string): FixtureResult {
  const commandDir = join(fixturesDir, commandName)
  const inputPath = join(commandDir, 'input.json')
  const outputPath = join(commandDir, 'output.json')

  if (!existsSync(inputPath) || !existsSync(outputPath)) {
    return {
      command: commandName,
      passed: false,
      errors: [`Missing input.json or output.json in ${commandDir}`],
    }
  }

  const input = readJson(inputPath)
  const output = readJson(outputPath)
  const expected = loadExpected(commandDir)
  const validator = validators[commandName]
  const errors = validator ? validator(input, output, expected) : []

  return { command: commandName, passed: errors.length === 0, errors }
}

export function runAll(fixturesDir: string): FixtureResult[] {
  if (!existsSync(fixturesDir)) return []
  return readdirSync(fixturesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => runFixture(fixturesDir, entry.name))
}
