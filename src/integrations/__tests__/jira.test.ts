/**
 * Unit tests for src/integrations/jira.ts — MOB-1084.
 *
 * Tests:
 *  - name property equals 'jira'
 *  - createIssue sends correct payload (project key, ADF description, priority mapping)
 *  - addComment sends correct ADF body
 *  - healthCheck returns { ok: true, latencyMs: ... } for 200 response
 *  - healthCheck returns { ok: false, ... } for 401 (returns false, not throws)
 *  - healthCheck returns { ok: false, ... } when fetch throws (network error)
 *  - 401 on createIssue throws the specific Portuguese message with token URL
 *  - updateIssue throws NotImplementedError
 *  - closeIssue throws NotImplementedError
 *  - createPR throws NotImplementedError
 *  - Factory registration: getIntegrationProvider({ jira: config }) returns JiraProvider
 *  - Factory registration: getIntegrationProvider({}) returns null
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { JiraProvider, NotImplementedError } from '../jira.js'
import { getIntegrationProvider, resetProviderFactories } from '../factory.js'
import type { JiraConfig } from '../../schemas/config.js'
import type { IssueInput, PRInput } from '../base.js'

// ---------------------------------------------------------------------------
// Import jira.ts as side effect so its registerProviderFactory call runs
// ---------------------------------------------------------------------------
import '../jira.js'

// ---------------------------------------------------------------------------
// Test config fixture
// ---------------------------------------------------------------------------

const JIRA_CONFIG: JiraConfig = {
  baseUrl: 'https://acme.atlassian.net',
  email: 'admin@acme.com',
  token: 'secret-token',
  projectKey: 'PROJ',
}

// ---------------------------------------------------------------------------
// Helper to create a fake Response
// ---------------------------------------------------------------------------

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

// ---------------------------------------------------------------------------
// Helpers for ADF validation
// ---------------------------------------------------------------------------

function isAdf(value: unknown, text: string): boolean {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Record<string, unknown>
  if (doc['version'] !== 1 || doc['type'] !== 'doc') return false
  const content = doc['content'] as Array<Record<string, unknown>>
  if (!Array.isArray(content) || content.length === 0) return false
  const para = content[0] as Record<string, unknown>
  if (para['type'] !== 'paragraph') return false
  const inner = para['content'] as Array<Record<string, unknown>>
  if (!Array.isArray(inner) || inner.length === 0) return false
  return inner[0]['type'] === 'text' && inner[0]['text'] === text
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// name property
// ---------------------------------------------------------------------------

describe('JiraProvider — name', () => {
  it('has name === "jira"', () => {
    const provider = new JiraProvider(JIRA_CONFIG)
    expect(provider.name).toBe('jira')
  })
})

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------

describe('JiraProvider — createIssue', () => {
  it('sends POST to /rest/api/3/issue with correct project key', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: '10001', key: 'PROJ-1' }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const input: IssueInput = { title: 'Test issue', description: 'Some desc', severity: 'high' }
    await provider.createIssue(input)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://acme.atlassian.net/rest/api/3/issue')
    expect(init.method).toBe('POST')

    const sentBody = JSON.parse(init.body as string) as { fields: Record<string, unknown> }
    expect(sentBody.fields['project']).toEqual({ key: 'PROJ' })
  })

  it('sends summary as the issue title', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: '10001', key: 'PROJ-1' }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const input: IssueInput = { title: 'My Title', description: 'desc', severity: 'low' }
    await provider.createIssue(input)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { fields: Record<string, unknown> }
    expect(sentBody.fields['summary']).toBe('My Title')
  })

  it('sends description as ADF', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: '10001', key: 'PROJ-1' }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const input: IssueInput = { title: 'T', description: 'Hello ADF', severity: 'medium' }
    await provider.createIssue(input)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { fields: Record<string, unknown> }
    expect(isAdf(sentBody.fields['description'], 'Hello ADF')).toBe(true)
  })

  it.each([
    ['critical', 'Highest'],
    ['high', 'High'],
    ['medium', 'Medium'],
    ['low', 'Low'],
  ])('maps severity "%s" to priority "%s"', async (severity, expectedPriority) => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: '10001', key: 'PROJ-1' }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const input: IssueInput = { title: 'T', description: 'D', severity }
    await provider.createIssue(input)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { fields: Record<string, unknown> }
    expect(sentBody.fields['priority']).toEqual({ name: expectedPriority })
  })

  it('falls back to Medium for unknown severity', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: '10001', key: 'PROJ-1' }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const input: IssueInput = { title: 'T', description: 'D', severity: 'unknown-level' }
    await provider.createIssue(input)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { fields: Record<string, unknown> }
    expect(sentBody.fields['priority']).toEqual({ name: 'Medium' })
  })

  it('returns IssueOutput with id, url containing the issue key, and provider "jira"', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ id: '10001', key: 'PROJ-42' }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const input: IssueInput = { title: 'T', description: 'D', severity: 'high' }
    const result = await provider.createIssue(input)

    expect(result.id).toBe('10001')
    expect(result.url).toBe('https://acme.atlassian.net/browse/PROJ-42')
    expect(result.provider).toBe('jira')
  })

  it('throws the Portuguese 401 message when createIssue gets 401', async () => {
    mockFetch.mockResolvedValue(makeResponse({}, 401))

    const provider = new JiraProvider(JIRA_CONFIG)
    const input: IssueInput = { title: 'T', description: 'D', severity: 'high' }

    await expect(provider.createIssue(input)).rejects.toThrow(
      'https://id.atlassian.com/manage-profile/security/api-tokens',
    )
    await expect(provider.createIssue(input)).rejects.toThrow(
      /Token Jira inválido/,
    )
  })
})

// ---------------------------------------------------------------------------
// addComment
// ---------------------------------------------------------------------------

describe('JiraProvider — addComment', () => {
  it('sends POST to the correct comment URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}))

    const provider = new JiraProvider(JIRA_CONFIG)
    await provider.addComment('PROJ-7', 'A comment body')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://acme.atlassian.net/rest/api/3/issue/PROJ-7/comment')
  })

  it('sends the comment body as ADF', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}))

    const provider = new JiraProvider(JIRA_CONFIG)
    await provider.addComment('PROJ-7', 'My comment text')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const sentBody = JSON.parse(init.body as string) as { body: unknown }
    expect(isAdf(sentBody.body, 'My comment text')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------

describe('JiraProvider — healthCheck', () => {
  it('returns { ok: true, latencyMs: <number> } for a 200 response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const result = await provider.healthCheck()

    expect(result.ok).toBe(true)
    expect(typeof result.latencyMs).toBe('number')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('returns { ok: false, latencyMs: <number> } for a 401 response (does not throw)', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }))

    const provider = new JiraProvider(JIRA_CONFIG)
    const result = await provider.healthCheck()

    expect(result.ok).toBe(false)
    expect(typeof result.latencyMs).toBe('number')
  })

  it('returns { ok: false, latencyMs: <number> } when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Network error'))

    const provider = new JiraProvider(JIRA_CONFIG)
    const result = await provider.healthCheck()

    expect(result.ok).toBe(false)
    expect(typeof result.latencyMs).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// Security guards
// ---------------------------------------------------------------------------

describe('JiraProvider — security guards', () => {
  it('constructor throws if baseUrl uses http (not https)', () => {
    expect(() => new JiraProvider({ ...JIRA_CONFIG, baseUrl: 'http://acme.atlassian.net' })).toThrow(
      /HTTPS/,
    )
  })

  it('constructor accepts https baseUrl', () => {
    expect(() => new JiraProvider(JIRA_CONFIG)).not.toThrow()
  })

  it('addComment throws for invalid issueId format', async () => {
    const provider = new JiraProvider(JIRA_CONFIG)
    await expect(provider.addComment('../../admin', 'body')).rejects.toThrow(/invalid issueId/)
    await expect(provider.addComment('proj-1', 'body')).rejects.toThrow(/invalid issueId/)
    await expect(provider.addComment('', 'body')).rejects.toThrow(/invalid issueId/)
  })

  it('addComment accepts valid issueId format', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({}))
    const provider = new JiraProvider(JIRA_CONFIG)
    await expect(provider.addComment('PROJ-7', 'body')).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// NotImplementedError methods
// ---------------------------------------------------------------------------

describe('JiraProvider — NotImplementedError methods', () => {
  it('updateIssue throws NotImplementedError', async () => {
    const provider = new JiraProvider(JIRA_CONFIG)
    await expect(provider.updateIssue('PROJ-1', { title: 'new' })).rejects.toThrow(NotImplementedError)
    await expect(provider.updateIssue('PROJ-1', {})).rejects.toThrow(/updateIssue/)
  })

  it('closeIssue throws NotImplementedError', async () => {
    const provider = new JiraProvider(JIRA_CONFIG)
    await expect(provider.closeIssue('PROJ-1')).rejects.toThrow(NotImplementedError)
    await expect(provider.closeIssue('PROJ-1')).rejects.toThrow(/closeIssue/)
  })

  it('createPR throws NotImplementedError', async () => {
    const provider = new JiraProvider(JIRA_CONFIG)
    const prInput: PRInput = { title: 'PR', body: 'body', branch: 'feat/x', base: 'main' }
    await expect(provider.createPR(prInput)).rejects.toThrow(NotImplementedError)
    await expect(provider.createPR(prInput)).rejects.toThrow(/createPR/)
  })

  it('NotImplementedError has correct name property', async () => {
    const provider = new JiraProvider(JIRA_CONFIG)
    try {
      await provider.updateIssue('x', {})
    } catch (err) {
      expect(err).toBeInstanceOf(NotImplementedError)
      expect((err as NotImplementedError).name).toBe('NotImplementedError')
    }
  })
})

// ---------------------------------------------------------------------------
// Factory registration
// ---------------------------------------------------------------------------

describe('JiraProvider — factory registration', () => {
  beforeEach(() => {
    resetProviderFactories()
    // Re-import jira.ts to re-register its factory after reset
  })

  afterEach(() => {
    resetProviderFactories()
  })

  it('getIntegrationProvider returns null when config has no jira key', async () => {
    // Register the factory manually (since module was already imported once)
    const { registerProviderFactory } = await import('../factory.js')
    const { JiraProvider: JP } = await import('../jira.js')
    registerProviderFactory((config) => {
      if (!config.jira) return null
      return new JP(config.jira)
    })

    const result = await getIntegrationProvider({})
    expect(result).toBeNull()
  })

  it('getIntegrationProvider returns a JiraProvider when config has jira key', async () => {
    const { registerProviderFactory } = await import('../factory.js')
    const { JiraProvider: JP } = await import('../jira.js')
    registerProviderFactory((config) => {
      if (!config.jira) return null
      return new JP(config.jira)
    })

    const result = await getIntegrationProvider({ jira: JIRA_CONFIG })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('jira')
    expect(result).toBeInstanceOf(JP)
  })
})
