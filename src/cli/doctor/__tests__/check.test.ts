/**
 * Unit tests for the doctor check registry (check.ts).
 *
 * IMPORTANT: We import check.ts in isolation — never import index.ts or any
 * individual check file here, because those modules call registerCheck() as a
 * side effect and would pollute the registry under test.
 *
 * vi.resetModules() is called before each test so every test starts with a
 * fresh, empty registry.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('check registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getChecks() returns empty array initially', async () => {
    const { getChecks } = await import('../check.js')
    expect(getChecks()).toEqual([])
  })

  it('registerCheck adds a check to the registry', async () => {
    const { registerCheck, getChecks } = await import('../check.js')
    const check = { name: 'my-check', run: async () => ({ status: 'pass' as const, message: 'ok' }) }
    registerCheck(check)
    expect(getChecks()).toHaveLength(1)
    expect(getChecks()[0].name).toBe('my-check')
  })

  it('multiple registerCheck calls accumulate checks', async () => {
    const { registerCheck, getChecks } = await import('../check.js')
    registerCheck({ name: 'a', run: async () => ({ status: 'pass' as const, message: 'a' }) })
    registerCheck({ name: 'b', run: async () => ({ status: 'warn' as const, message: 'b' }) })
    registerCheck({ name: 'c', run: async () => ({ status: 'fail' as const, message: 'c' }) })
    expect(getChecks()).toHaveLength(3)
    expect(getChecks().map((c) => c.name)).toEqual(['a', 'b', 'c'])
  })
})
