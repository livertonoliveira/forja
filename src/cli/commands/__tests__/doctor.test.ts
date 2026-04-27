/**
 * Integration tests for `src/cli/commands/doctor.ts`
 *
 * Covers:
 *   - All checks pass → exit code 0, "All checks passed" summary
 *   - Any warn → exit code 1, shows remediation hint
 *   - Any fail → exit code 2, shows error count
 *   - --json flag → valid JSON output with correct shape
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DoctorCheck } from '../../doctor/check.js'

// ---------------------------------------------------------------------------
// Mock getChecks before importing the command
// vi.hoisted ensures mockGetChecks is available when vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockGetChecks, mockListCircuitBreakers } = vi.hoisted(() => ({
  mockGetChecks: vi.fn<() => DoctorCheck[]>(),
  mockListCircuitBreakers: vi.fn(() => []),
}))

vi.mock('../../doctor/check.js', () => ({
  getChecks: mockGetChecks,
}))

vi.mock('../../../hooks/circuit-breaker.js', () => ({
  listCircuitBreakers: mockListCircuitBreakers,
}))

// Also mock the side-effect import that registers real checks
vi.mock('../../doctor/checks/index.js', () => ({}))

// Import after mocks are set up
import { doctorCommand } from '../doctor.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the doctor command programmatically with given args.
 * Captures console.log output and the exit code thrown by process.exit.
 * Returns { logs, exitCode }.
 */
async function runDoctorCommand(args: string[] = []): Promise<{ logs: string[]; exitCode: number }> {
  const logs: string[] = []

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...msgs: unknown[]) => {
    logs.push(msgs.map(String).join(' '))
  })

  let exitCode = -1
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
    exitCode = Number(code ?? 0)
    throw new Error(`process.exit(${exitCode})`)
  })

  try {
    await doctorCommand.parseAsync(['doctor', ...args], { from: 'user' })
  } catch (e) {
    // swallow the artificial process.exit error
    if (!(e instanceof Error) || !e.message.startsWith('process.exit(')) {
      throw e
    }
  } finally {
    logSpy.mockRestore()
    exitSpy.mockRestore()
  }

  return { logs, exitCode }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCheck(name: string, status: 'pass' | 'warn' | 'fail', message: string, remediation?: string): DoctorCheck {
  return {
    name,
    run: async () => ({ status, message, ...(remediation !== undefined ? { remediation } : {}) }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('doctor command — all checks pass', () => {
  beforeEach(() => {
    mockGetChecks.mockReturnValue([
      makeCheck('check-one', 'pass', 'ok'),
      makeCheck('check-two', 'pass', 'looking good'),
      makeCheck('check-three', 'pass', 'all fine'),
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exits with code 0', async () => {
    const { exitCode } = await runDoctorCommand()
    expect(exitCode).toBe(0)
  })

  it('prints ✓ for each passing check', async () => {
    const { logs } = await runDoctorCommand()
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('✓')
  })

  it('prints "All checks passed" summary', async () => {
    const { logs } = await runDoctorCommand()
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('All checks passed')
  })
})

describe('doctor command — any warn', () => {
  beforeEach(() => {
    mockGetChecks.mockReturnValue([
      makeCheck('check-pass', 'pass', 'ok'),
      makeCheck('check-warn', 'warn', 'could be better', 'fix this'),
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exits with code 1', async () => {
    const { exitCode } = await runDoctorCommand()
    expect(exitCode).toBe(1)
  })

  it('prints ⚠ for the warning check', async () => {
    const { logs } = await runDoctorCommand()
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('⚠')
  })

  it('prints the remediation hint', async () => {
    const { logs } = await runDoctorCommand()
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('  → fix this')
  })

  it('prints "1 warning(s)" in the summary', async () => {
    const { logs } = await runDoctorCommand()
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('1 warning(s)')
  })
})

describe('doctor command — any fail', () => {
  beforeEach(() => {
    mockGetChecks.mockReturnValue([
      makeCheck('check-fail', 'fail', 'something broke'),
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exits with code 2', async () => {
    const { exitCode } = await runDoctorCommand()
    expect(exitCode).toBe(2)
  })

  it('prints ✗ for the failing check', async () => {
    const { logs } = await runDoctorCommand()
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('✗')
  })

  it('prints "1 error(s)" in the summary', async () => {
    const { logs } = await runDoctorCommand()
    const allOutput = logs.join('\n')
    expect(allOutput).toContain('1 error(s)')
  })
})

describe('doctor command — --json flag', () => {
  beforeEach(() => {
    mockGetChecks.mockReturnValue([
      makeCheck('check-json', 'pass', 'json output ok'),
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('outputs valid JSON', async () => {
    const { logs } = await runDoctorCommand(['--json'])
    const combined = logs.join('')
    expect(() => JSON.parse(combined)).not.toThrow()
  })

  it('outputs an object with checks and circuitBreakers fields', async () => {
    const { logs } = await runDoctorCommand(['--json'])
    const parsed = JSON.parse(logs.join(''))
    expect(Array.isArray(parsed.checks)).toBe(true)
    expect(Array.isArray(parsed.circuitBreakers)).toBe(true)
  })

  it('each entry has name, status, and message fields', async () => {
    const { logs } = await runDoctorCommand(['--json'])
    const { checks } = JSON.parse(logs.join(''))
    const [entry] = checks
    expect(entry).toHaveProperty('name', 'check-json')
    expect(entry).toHaveProperty('status', 'pass')
    expect(entry).toHaveProperty('message', 'json output ok')
  })
})
