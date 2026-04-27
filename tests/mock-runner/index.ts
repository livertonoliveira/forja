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

export interface ContractResult {
  passed: boolean
  errors: string[]
}

type ValidatorFn = (input: unknown, output: unknown, expected: Record<string, unknown>) => string[]

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

export function formatDiff(expected: unknown, actual: unknown): string {
  return `Expected:\n${JSON.stringify(expected, null, 2)}\nActual:\n${JSON.stringify(actual, null, 2)}`
}

export function checkSpecOutput(output: unknown): ContractResult {
  const errors: string[] = []
  const str = JSON.stringify(output)
  if (!/REQ-\d+/.test(str)) {
    errors.push(
      `output must contain REQ-\\d+ pattern\n` +
        formatDiff('...REQ-001...', `${str.slice(0, 200)}...`)
    )
  }
  if (!/< ?400 lin(has|es)/.test(str)) {
    errors.push(
      `output must contain at least one task annotated with "< 400 linhas"\n` +
        formatDiff('{ "estimatedLines": "< 400 linhas" }', `${str.slice(0, 200)}...`)
    )
  }
  return { passed: errors.length === 0, errors }
}

export function checkDevelopOutput(output: unknown): ContractResult {
  const out = output as { traceEvents?: Array<{ type: string }> }
  const events = out.traceEvents ?? []
  const types = events.map((e) => e.type)
  const errors: string[] = []
  if (!types.includes('phase_start')) {
    errors.push(
      `output must contain phase_start trace event\n` +
        formatDiff([{ type: 'phase_start' }, '...', { type: 'phase_end' }], events)
    )
  }
  if (!types.includes('phase_end')) {
    errors.push(
      `output must contain phase_end trace event\n` +
        formatDiff([{ type: 'phase_start' }, '...', { type: 'phase_end' }], events)
    )
  }
  const startIdx = types.indexOf('phase_start')
  const endIdx = types.lastIndexOf('phase_end')
  if (startIdx !== -1 && endIdx !== -1 && startIdx >= endIdx) {
    errors.push(
      `phase_start must appear before phase_end\n` +
        formatDiff({ firstPhaseStart: '<N', lastPhaseEnd: 'N' }, { startIdx, endIdx })
    )
  }
  return { passed: errors.length === 0, errors }
}

export function checkPrOutput(output: unknown): ContractResult {
  const str = JSON.stringify(output)
  const errors: string[] = []
  if (!/[a-z]+\/[a-zA-Z]+-\d+-[a-z0-9-]+/.test(str)) {
    errors.push(
      `output must contain a branchName matching <type>/<id>-<description> format\n` +
        formatDiff({ branchName: 'feat/mob-123-short-description' }, output)
    )
  }
  return { passed: errors.length === 0, errors }
}

export function checkFindingsOutput(output: unknown, commandName: string): ContractResult {
  const out = output as Record<string, unknown>
  const errors: string[] = []
  if (!('findings' in out)) {
    errors.push(
      `${commandName} output must contain a 'findings' array\n` +
        formatDiff({ findings: [] }, out)
    )
    return { passed: false, errors }
  }
  const findings = (out['findings'] as unknown[]) ?? []
  const validSeverities = ['critical', 'high', 'medium', 'low']
  for (const [i, finding] of findings.entries()) {
    const f = finding as Record<string, unknown>
    if (!f['severity'] || !validSeverities.includes(f['severity'] as string)) {
      errors.push(
        `findings[${i}].severity must be one of ${validSeverities.join(', ')}\n` +
          formatDiff({ severity: 'critical|high|medium|low' }, { severity: f['severity'] })
      )
    }
    if (!f['title'] || typeof f['title'] !== 'string') {
      errors.push(
        `findings[${i}].title must be a non-empty string\n` +
          formatDiff({ title: 'string' }, { title: f['title'] })
      )
    }
  }
  return { passed: errors.length === 0, errors }
}

export function checkPhaseEventsOutput(output: unknown, phase: string): ContractResult {
  const out = output as { traceEvents?: Array<{ type: string }> }
  const events = out.traceEvents ?? []
  const errors: string[] = []
  const hasStart = events.some((e) => e.type === 'phase_start')
  const hasEnd = events.some((e) => e.type === 'phase_end')
  if (!hasStart || !hasEnd) {
    errors.push(
      `${phase} output must have phase_start and phase_end trace events\n` +
        formatDiff(
          { traceEvents: [{ type: 'phase_start' }, { type: 'phase_end' }] },
          { traceEvents: events }
        )
    )
  }
  return { passed: errors.length === 0, errors }
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
  const result = checkSpecOutput(output)
  const errors = result.errors.slice()
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
  const traceErrors = validateTraceEvents(output, expected)
  if (traceErrors.length > 0) return traceErrors
  return checkDevelopOutput(output).errors
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
    // Only run fixture directories that follow the forja-<command-name> naming convention
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('forja-'))
    .map((entry) => runFixture(fixturesDir, entry.name))
}
