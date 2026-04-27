/**
 * Unit tests for individual doctor checks — all external dependencies mocked.
 *
 * Strategy: vi.mock() is hoisted at the top of the file (before any imports),
 * so when each check file is imported, it already sees the mock in place.
 * We import check files eagerly at the top so vi.mock hoisting applies, then
 * retrieve the registered check from the registry by name.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted by vitest before imports)
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    statfs: vi.fn(),
  },
}))

vi.mock('../../../config/loader.js', () => ({
  loadConfig: vi.fn(),
  redactDsn: (s: string) => s,
}))

// Mock store so db-connection doesn't try a real connection
vi.mock('../../../store/index.js', () => ({
  createStore: () => ({
    ping: vi.fn().mockRejectedValue(new Error('mocked')),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}))

// ---------------------------------------------------------------------------
// Import ALL check files so they register themselves into the registry.
// These must come AFTER vi.mock() declarations above.
// ---------------------------------------------------------------------------

import '../checks/node-version.js'
import '../checks/config-valid.js'
import '../checks/github-token.js'
import '../checks/anthropic-api-key.js'
import '../checks/disk-space.js'
import '../checks/db-connection.js'
import '../checks/linear-connectivity.js'
import '../checks/db-migrations.js'
import '../checks/i18n-config.js'

import { getChecks } from '../check.js'
import fs from 'node:fs/promises'
import { loadConfig } from '../../../config/loader.js'

const fsMock = fs as unknown as { readFile: ReturnType<typeof vi.fn>; statfs: ReturnType<typeof vi.fn> }
const loadConfigMock = loadConfig as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// node-version
// ---------------------------------------------------------------------------

describe('node-version check', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns pass for Node.js v20', async () => {
    vi.spyOn(process, 'version', 'get').mockReturnValue('v20.0.0')
    const check = getChecks().find((c) => c.name === 'node-version')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
  })

  it('returns fail for Node.js v18', async () => {
    vi.spyOn(process, 'version', 'get').mockReturnValue('v18.0.0')
    const check = getChecks().find((c) => c.name === 'node-version')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('fail')
    expect(result.message).toContain('v18.0.0')
  })
})

// ---------------------------------------------------------------------------
// config-valid
// ---------------------------------------------------------------------------

describe('config-valid check', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns pass when all required sections are present', async () => {
    fsMock.readFile.mockResolvedValue('## Project\n## Stack\n## Linear Integration\n')
    const check = getChecks().find((c) => c.name === 'config-valid')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
  })

  it('returns warn when a section is missing', async () => {
    fsMock.readFile.mockResolvedValue('## Project\n## Stack\n')
    const check = getChecks().find((c) => c.name === 'config-valid')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('warn')
    expect(result.message).toContain('## Linear Integration')
  })

  it('returns fail when file does not exist (ENOENT)', async () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' })
    fsMock.readFile.mockRejectedValue(err)
    const check = getChecks().find((c) => c.name === 'config-valid')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('fail')
    expect(result.message).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// github-token
// ---------------------------------------------------------------------------

describe('github-token check', () => {
  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  it('returns pass when config.githubToken is set', async () => {
    delete process.env.GITHUB_TOKEN
    loadConfigMock.mockResolvedValue({ githubToken: 'tok' })
    const check = getChecks().find((c) => c.name === 'github-token')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
  })

  it('returns warn when no token configured and no env var', async () => {
    delete process.env.GITHUB_TOKEN
    loadConfigMock.mockResolvedValue({ githubToken: undefined })
    const check = getChecks().find((c) => c.name === 'github-token')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// anthropic-api-key
// ---------------------------------------------------------------------------

describe('anthropic-api-key check', () => {
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  it('returns pass when ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    const check = getChecks().find((c) => c.name === 'anthropic-api-key')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
  })

  it('returns warn when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const check = getChecks().find((c) => c.name === 'anthropic-api-key')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('warn')
    expect(result.message).toContain('ANTHROPIC_API_KEY')
  })
})

// ---------------------------------------------------------------------------
// disk-space
// ---------------------------------------------------------------------------

describe('disk-space check', () => {
  const GB5 = 5 * 1024 * 1024 * 1024
  const MB100 = 100 * 1024 * 1024

  function makeStatfs(available: number) {
    const bsize = 4096
    const bavail = Math.floor(available / bsize)
    return { bsize, bavail, blocks: bavail * 2, bfree: bavail, files: 0, ffree: 0 }
  }

  afterEach(() => { vi.restoreAllMocks() })

  it('returns pass when 5 GB is available', async () => {
    fsMock.statfs.mockResolvedValue(makeStatfs(GB5))
    const check = getChecks().find((c) => c.name === 'disk-space')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
  })

  it('returns warn when only 100 MB is available', async () => {
    fsMock.statfs.mockResolvedValue(makeStatfs(MB100))
    const check = getChecks().find((c) => c.name === 'disk-space')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// db-connection — verify name only (no real DB connection)
// ---------------------------------------------------------------------------

describe('db-connection check — name only', () => {
  it('has name "db-connection"', () => {
    const check = getChecks().find((c) => c.name === 'db-connection')
    expect(check).toBeDefined()
    expect(check!.name).toBe('db-connection')
  })
})

// ---------------------------------------------------------------------------
// linear-connectivity — verify name only (no real network call)
// ---------------------------------------------------------------------------

describe('linear-connectivity check — name only', () => {
  it('has name "linear-connectivity"', () => {
    const check = getChecks().find((c) => c.name === 'linear-connectivity')
    expect(check).toBeDefined()
    expect(check!.name).toBe('linear-connectivity')
  })
})

// ---------------------------------------------------------------------------
// i18n-config
// ---------------------------------------------------------------------------

describe('i18n-config check', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returns pass when forja/config.md does not exist', async () => {
    fsMock.readFile.mockRejectedValue(Object.assign(new Error('no such file'), { code: 'ENOENT' }))
    const check = getChecks().find((c) => c.name === 'i18n-config')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
  })

  it('returns warn when artifact_language is absent', async () => {
    fsMock.readFile.mockResolvedValue('## Project\n## Stack\n## Linear Integration\n')
    const check = getChecks().find((c) => c.name === 'i18n-config')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('warn')
    expect(result.message).toContain('artifact_language')
    expect(result.remediation).toContain('forja config migrate')
  })

  it('returns fail when artifact_language has an invalid value', async () => {
    fsMock.readFile.mockResolvedValue('## Conventions\n- artifact_language: xx-INVALID\n')
    const check = getChecks().find((c) => c.name === 'i18n-config')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('fail')
    expect(result.message).toContain('xx-INVALID')
  })

  it('returns pass when artifact_language is valid', async () => {
    fsMock.readFile.mockResolvedValue('## Conventions\n- artifact_language: pt-BR\n')
    const check = getChecks().find((c) => c.name === 'i18n-config')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
    expect(result.message).toContain('pt-BR')
  })

  it('returns pass when artifact_language is set via human-readable label with inline comment', async () => {
    fsMock.readFile.mockResolvedValue('## Conventions\n- Artifact language: en (specs, docs)\n')
    const check = getChecks().find((c) => c.name === 'i18n-config')
    expect(check).toBeDefined()
    const result = await check!.run()
    expect(result.status).toBe('pass')
  })
})
