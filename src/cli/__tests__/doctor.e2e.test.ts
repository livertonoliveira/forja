import { test, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve project root relative to this source file: src/cli/__tests__ → root
const PROJECT_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const BINARY = resolve(PROJECT_ROOT, 'bin/forja.js')

test('forja doctor --json outputs valid JSON array', () => {
  let output = ''
  try {
    output = execSync(`node ${BINARY} doctor --json`, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, FORJA_STORE_URL: 'postgresql://forja:forja@localhost:5432/forja' },
      timeout: 15000,
    }).toString()
  } catch (err: any) {
    // process.exit non-zero — capture stdout from the error
    output = err.stdout?.toString() ?? ''
  }

  const parsed = JSON.parse(output)
  expect(Array.isArray(parsed)).toBe(true)
  expect(parsed.length).toBeGreaterThan(0)
  // Each item has name, status, message
  for (const item of parsed) {
    expect(item).toHaveProperty('name')
    expect(item).toHaveProperty('status')
    expect(['pass', 'warn', 'fail']).toContain(item.status)
    expect(item).toHaveProperty('message')
  }
})

test('forja doctor outputs checklist with icons', () => {
  let output = ''
  try {
    output = execSync(`node ${BINARY} doctor`, {
      cwd: PROJECT_ROOT,
      timeout: 15000,
    }).toString()
  } catch (err: any) {
    output = err.stdout?.toString() ?? ''
  }

  // Should contain at least one of the icons
  const hasIcon = output.includes('✓') || output.includes('⚠') || output.includes('✗')
  expect(hasIcon).toBe(true)
  // Should contain summary
  const hasSummary = output.includes('All checks passed') || output.includes('warning') || output.includes('error')
  expect(hasSummary).toBe(true)
})

test('forja doctor exits with code 0, 1, or 2', () => {
  let code = 0
  try {
    execSync(`node ${BINARY} doctor --json`, {
      cwd: PROJECT_ROOT,
      timeout: 15000,
    })
    code = 0
  } catch (err: any) {
    code = err.status ?? 1
  }

  expect([0, 1, 2]).toContain(code)
})

test('forja doctor completes in under 10 seconds', async () => {
  const start = Date.now()
  try {
    execSync(`node ${BINARY} doctor --json`, {
      cwd: PROJECT_ROOT,
      timeout: 12000,
    })
  } catch {
    // ignore exit code
  }
  const elapsed = Date.now() - start
  expect(elapsed).toBeLessThan(10000)
}, 12000)
