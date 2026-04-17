import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runAll, loadFixtureData } from './mock-runner/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, 'fixtures')

// Run all fixtures once at module scope to avoid redundant I/O
const allResults = runAll(fixturesDir)

describe('Command contract tests', () => {
  for (const result of allResults) {
    it(`${result.command} fixture passes validation`, () => {
      if (!result.passed) {
        throw new Error(`Fixture "${result.command}" failed:\n${result.errors.join('\n\n')}`)
      }
      expect(result.passed).toBe(true)
    })
  }
})

describe('/forja:gate', () => {
  it('returns exitCode 2 when findings include critical severity', () => {
    const { output } = loadFixtureData(fixturesDir, 'forja-gate')
    const out = output as { exitCode?: number }
    expect(out.exitCode).toBe(2)
  })
})

describe('/forja:spec', () => {
  it('output contains REQ-\\d+ pattern in the proposal', () => {
    const { output } = loadFixtureData(fixturesDir, 'forja-spec')
    expect(JSON.stringify(output)).toMatch(/REQ-\d+/)
  })
})

describe('/forja:develop', () => {
  it('traceEvents contains phase_start and phase_end', () => {
    const { output } = loadFixtureData(fixturesDir, 'forja-develop')
    const out = output as { traceEvents?: Array<{ type: string }> }
    const types = (out.traceEvents ?? []).map((e) => e.type)
    expect(types).toContain('phase_start')
    expect(types).toContain('phase_end')
  })
})
