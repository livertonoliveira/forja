import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  formatDiff,
  checkSpecOutput,
  checkDevelopOutput,
  checkPrOutput,
  checkFindingsOutput,
  checkPhaseEventsOutput,
  type ContractResult,
} from './mock-runner/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Set UPDATE_GOLDEN=1 to regenerate golden snapshots from current output.json files.
const UPDATE_GOLDEN = process.env.UPDATE_GOLDEN === '1'
const fixturesDir = resolve(join(__dirname, 'fixtures'))

const COMMANDS: Array<{ name: string; fixture: string }> = [
  { name: 'init', fixture: 'forja-init' },
  { name: 'spec', fixture: 'forja-spec' },
  { name: 'run', fixture: 'forja-run' },
  { name: 'develop', fixture: 'forja-develop' },
  { name: 'test', fixture: 'forja-test' },
  { name: 'perf', fixture: 'forja-perf' },
  { name: 'security', fixture: 'forja-security' },
  { name: 'review', fixture: 'forja-review' },
  { name: 'homolog', fixture: 'forja-homolog' },
  { name: 'pr', fixture: 'forja-pr' },
  { name: 'update', fixture: 'forja-update' },
  { name: 'audit/backend', fixture: 'forja-audit-backend' },
  { name: 'audit/frontend', fixture: 'forja-audit-frontend' },
  { name: 'audit/database', fixture: 'forja-audit-database' },
  { name: 'audit/security', fixture: 'forja-audit-security' },
  { name: 'audit/run', fixture: 'forja-audit-run' },
]

// Load all fixture outputs once at module scope to avoid per-test I/O
const fixtureCache = new Map<string, { output: unknown; golden: unknown | null }>()
for (const { fixture } of COMMANDS) {
  const outputPath = join(fixturesDir, fixture, 'output.json')
  const goldenPath = join(fixturesDir, fixture, 'expected', 'golden-output.json')
  const output: unknown = existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf-8'))
    : null
  const golden: unknown | null = existsSync(goldenPath)
    ? JSON.parse(readFileSync(goldenPath, 'utf-8'))
    : null
  fixtureCache.set(fixture, { output, golden })
}

const contractValidators: Record<string, (output: unknown) => ContractResult> = {
  spec: checkSpecOutput,
  develop: checkDevelopOutput,
  pr: checkPrOutput,
  perf: (o) => checkFindingsOutput(o, 'perf'),
  security: (o) => checkFindingsOutput(o, 'security'),
  review: (o) => checkFindingsOutput(o, 'review'),
  init: (o) => checkPhaseEventsOutput(o, 'init'),
  run: (o) => checkPhaseEventsOutput(o, 'run'),
  test: (o) => checkPhaseEventsOutput(o, 'test'),
  homolog: (o) => checkPhaseEventsOutput(o, 'homolog'),
  update: (o) => checkPhaseEventsOutput(o, 'update'),
  'audit/backend': (o) => checkFindingsOutput(o, 'audit/backend'),
  'audit/frontend': (o) => checkFindingsOutput(o, 'audit/frontend'),
  'audit/database': (o) => checkFindingsOutput(o, 'audit/database'),
  'audit/security': (o) => checkFindingsOutput(o, 'audit/security'),
  'audit/run': (o) => checkFindingsOutput(o, 'audit/run'),
}

describe('Golden tests — all 16 /forja:* commands', () => {
  for (const { name, fixture } of COMMANDS) {
    it(`/forja:${name}`, () => {
      const { output, golden } = fixtureCache.get(fixture)!

      if (output === null) {
        throw new Error(`Missing output.json for /forja:${name} in tests/fixtures/${fixture}/`)
      }

      if (!(typeof output === 'object' && output !== null)) {
        throw new Error(`output.json for /forja:${name} must be a JSON object or array`)
      }

      if (UPDATE_GOLDEN) {
        const expectedDir = join(fixturesDir, fixture, 'expected')
        const goldenPath = join(expectedDir, 'golden-output.json')
        // Guard: resolved path must stay within fixturesDir
        if (!resolve(goldenPath).startsWith(fixturesDir + '/')) {
          throw new Error(`Unsafe golden path: ${goldenPath}`)
        }
        mkdirSync(expectedDir, { recursive: true })
        writeFileSync(goldenPath, JSON.stringify(output, null, 2) + '\n', 'utf-8')
        expect(true).toBe(true)
        return
      }

      // Contract validation
      const validator = contractValidators[name]
      if (validator) {
        const result = validator(output)
        if (!result.passed) {
          throw new Error(`/forja:${name} contract violation:\n${result.errors.join('\n\n')}`)
        }
      }

      // Golden snapshot comparison
      if (golden === null) {
        throw new Error(
          `Golden snapshot missing for /forja:${name}.\nRun: npm run test:update-golden`
        )
      }

      const outputStr = JSON.stringify(output)
      const goldenStr = JSON.stringify(golden)
      if (outputStr !== goldenStr) {
        throw new Error(
          `/forja:${name} golden snapshot mismatch (run "npm run test:update-golden" to accept):\n` +
            formatDiff(golden, output)
        )
      }

      expect(output).toEqual(golden)
    })
  }
})
