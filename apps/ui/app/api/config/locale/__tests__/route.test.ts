/**
 * Integration tests for GET /api/config/locale (MOB-1082)
 *
 * Tests the route handler directly by importing and calling GET().
 * Three sources of locale are exercised:
 *   1. FORJA_ARTIFACT_LANGUAGE env var (highest priority)
 *   2. forja/config.md file (fallback when env var absent)
 *   3. Hardcoded default 'en' (when neither source is available)
 *
 * Run from apps/ui/:
 *   npx vitest run app/api/config/locale
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock next/server so the route runs outside the Next.js runtime
// ---------------------------------------------------------------------------

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callGET(): Promise<{ status: number; json: { locale: string } }> {
  const { GET } = await import('../route')
  const res = await GET()
  const json = await res.json()
  return { status: res.status, json }
}

// ---------------------------------------------------------------------------
// Env var management — save/restore so tests don't bleed into each other
// ---------------------------------------------------------------------------

let originalEnv: string | undefined

beforeEach(() => {
  originalEnv = process.env.FORJA_ARTIFACT_LANGUAGE
  // Reset module cache between tests so each import picks up the current env
  vi.resetModules()
})

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env.FORJA_ARTIFACT_LANGUAGE
  } else {
    process.env.FORJA_ARTIFACT_LANGUAGE = originalEnv
  }
})

// ===========================================================================
// 1. Env var source
// ===========================================================================

describe('GET /api/config/locale — env var source', () => {
  it('returns { locale: "pt-BR" } when FORJA_ARTIFACT_LANGUAGE=pt-BR', async () => {
    process.env.FORJA_ARTIFACT_LANGUAGE = 'pt-BR'
    vi.resetModules()

    const { status, json } = await callGET()

    expect(status).toBe(200)
    expect(json).toEqual({ locale: 'pt-BR' })
  })

  it('returns { locale: "es" } when FORJA_ARTIFACT_LANGUAGE=es', async () => {
    process.env.FORJA_ARTIFACT_LANGUAGE = 'es'
    vi.resetModules()

    const { status, json } = await callGET()

    expect(status).toBe(200)
    expect(json).toEqual({ locale: 'es' })
  })

  it('falls back to config/default when FORJA_ARTIFACT_LANGUAGE is an unsupported value', async () => {
    process.env.FORJA_ARTIFACT_LANGUAGE = 'xx-INVALID'
    vi.resetModules()

    // The env var is invalid, so readActiveLocale will fall through to
    // readFromConfigMd(). The real forja/config.md in the monorepo root
    // declares "pt-BR", so we expect that (or 'en' if the file is not found).
    const { status, json } = await callGET()

    expect(status).toBe(200)
    // Either the config file resolved to 'pt-BR' or the default 'en' was used.
    // Both are valid supported locales — the important thing is that the
    // unsupported env value was NOT returned.
    expect(json.locale).not.toBe('xx-INVALID')
    expect(['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh-CN']).toContain(json.locale)
  })
})

// ===========================================================================
// 2. Fallback to 'en' — mock the active-locale module
// ===========================================================================

describe('GET /api/config/locale — fallback to "en"', () => {
  it('returns { locale: "en" } when no env var is set and readActiveLocale returns "en"', async () => {
    delete process.env.FORJA_ARTIFACT_LANGUAGE
    vi.resetModules()

    // Mock the helper to simulate: no env var, no config file → default 'en'
    vi.doMock('@/lib/active-locale', () => ({
      readActiveLocale: vi.fn().mockResolvedValue('en'),
    }))

    const { status, json } = await callGET()

    expect(status).toBe(200)
    expect(json).toEqual({ locale: 'en' })
  })
})

// ===========================================================================
// 3. forja/config.md source
// ===========================================================================

describe('GET /api/config/locale — forja/config.md source', () => {
  it('returns { locale: "pt-BR" } when config.md declares "Artifact language: pt-BR"', async () => {
    delete process.env.FORJA_ARTIFACT_LANGUAGE
    vi.resetModules()

    // Simulate readActiveLocale reading from config.md and returning 'pt-BR'
    vi.doMock('@/lib/active-locale', () => ({
      readActiveLocale: vi.fn().mockResolvedValue('pt-BR'),
    }))

    const { status, json } = await callGET()

    expect(status).toBe(200)
    expect(json).toEqual({ locale: 'pt-BR' })
  })

  it('reads the real monorepo forja/config.md and returns pt-BR (integration)', async () => {
    // This test exercises the real fs path without any mocks.
    // The monorepo forja/config.md contains: Artifact language: pt-BR
    // readActiveLocale will find this via the "../../forja/config.md" candidate
    // when cwd is apps/ui/.
    delete process.env.FORJA_ARTIFACT_LANGUAGE
    vi.resetModules()

    const { status, json } = await callGET()

    expect(status).toBe(200)
    expect(json).toEqual({ locale: 'pt-BR' })
  })
})

// ===========================================================================
// 4. Response shape
// ===========================================================================

describe('GET /api/config/locale — response shape', () => {
  it('response always contains exactly a "locale" key with a string value', async () => {
    process.env.FORJA_ARTIFACT_LANGUAGE = 'fr'
    vi.resetModules()

    const { json } = await callGET()

    expect(json).toHaveProperty('locale')
    expect(typeof json.locale).toBe('string')
    expect(Object.keys(json)).toEqual(['locale'])
  })
})
