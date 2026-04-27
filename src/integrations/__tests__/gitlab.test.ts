/**
 * Unit tests for src/integrations/gitlab.ts — MOB-1085.
 *
 * Tests:
 *  - createPR: calls correct MR endpoint, sends correct body, returns PROutput
 *  - createPR: works with self-managed baseUrl
 *  - createIssue: skips label creation when label already exists
 *  - createIssue: creates label then issue when label does not exist
 *  - createIssue: includes severity label in labels field
 *  - healthCheck: returns ok: true and calls GET /api/v4/user
 *  - healthCheck: returns ok: false when user endpoint responds with error
 *  - healthCheck: warns when GitLab version is below 14.0
 *  - healthCheck: does not warn when version >= 14.0
 *  - addComment: posts to correct notes endpoint with IID
 *  - authentication: sends Private-Token header
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest'
import { GitLabProvider } from '../gitlab.js'
import type { PRInput } from '../base.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG = {
  baseUrl: 'https://gitlab.com',
  token: 'glpat-test-token',
  projectId: 42,
}

const SELF_MANAGED_CONFIG = {
  baseUrl: 'https://mygitlab.internal',
  token: 'glpat-self-managed-token',
  projectId: 99,
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// createPR
// ---------------------------------------------------------------------------

describe('GitLabProvider — createPR', () => {
  let fetchSpy: MockInstance<typeof fetch>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ iid: 7, web_url: 'https://gitlab.com/acme/repo/-/merge_requests/7' }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls correct merge_requests endpoint', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.createPR({ title: 'Quality Report', body: '## Summary', branch: 'feature/foo', base: 'main' })
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gitlab.com/api/v4/projects/42/merge_requests')
  })

  it('sends title, description, source_branch, target_branch in body', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    const input: PRInput = { title: 'Quality Report', body: '## Quality report body', branch: 'feature/bar', base: 'main' }
    await provider.createPR(input)
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.title).toBe('Quality Report')
    expect(body.description).toBe('## Quality report body')
    expect(body.source_branch).toBe('feature/bar')
    expect(body.target_branch).toBe('main')
  })

  it('returns PROutput with iid as id and provider "gitlab"', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.createPR({ title: 'Test', body: 'Body', branch: 'feature/x', base: 'main' })
    expect(result.id).toBe('7')
    expect(result.url).toBe('https://gitlab.com/acme/repo/-/merge_requests/7')
    expect(result.provider).toBe('gitlab')
  })

  it('works with self-managed baseUrl', async () => {
    const provider = new GitLabProvider(SELF_MANAGED_CONFIG)
    await provider.createPR({ title: 'Test', body: 'Body', branch: 'feature/x', base: 'main' })
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://mygitlab.internal/api/v4/projects/99/merge_requests')
  })
})

// ---------------------------------------------------------------------------
// createIssue — label already exists
// ---------------------------------------------------------------------------

describe('GitLabProvider — createIssue with existing label', () => {
  let fetchSpy: MockInstance<typeof fetch>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse([{ name: 'critical' }, { name: 'high' }])) // GET /labels
      .mockResolvedValueOnce(jsonResponse({ iid: 3, web_url: 'https://gitlab.com/acme/repo/-/issues/3' })) // POST /issues
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not call POST /labels when label already exists', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.createIssue({ title: 'Critical issue', description: 'Details', severity: 'critical' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [getUrl] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const [postUrl] = fetchSpy.mock.calls[1] as [string, RequestInit]
    expect(getUrl).toBe('https://gitlab.com/api/v4/projects/42/labels?per_page=100')
    expect(postUrl).toBe('https://gitlab.com/api/v4/projects/42/issues')
  })

  it('returns IssueOutput with iid as id and provider "gitlab"', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.createIssue({ title: 'Issue', description: 'Desc', severity: 'high' })
    expect(result.id).toBe('3')
    expect(result.url).toBe('https://gitlab.com/acme/repo/-/issues/3')
    expect(result.provider).toBe('gitlab')
  })
})

// ---------------------------------------------------------------------------
// createIssue — label does not exist (create + assign)
// ---------------------------------------------------------------------------

describe('GitLabProvider — createIssue with non-existing label', () => {
  let fetchSpy: MockInstance<typeof fetch>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse([]))                          // GET /labels → empty
      .mockResolvedValueOnce(jsonResponse({ id: 1, name: 'medium' }))  // POST /labels → created
      .mockResolvedValueOnce(jsonResponse({ iid: 5, web_url: 'https://gitlab.com/acme/repo/-/issues/5' })) // POST /issues
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates label via POST /labels when it does not exist', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.createIssue({ title: 'Medium issue', description: 'Details', severity: 'medium' })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const [, createLabelInit] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const labelBody = JSON.parse(createLabelInit.body as string)
    expect(labelBody.name).toBe('medium')
  })

  it('includes severity label in issue creation labels field', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.createIssue({ title: 'Issue', description: 'Desc', severity: 'medium' })
    const [, issueInit] = fetchSpy.mock.calls[2] as [string, RequestInit]
    const body = JSON.parse(issueInit.body as string)
    expect(body.labels).toContain('medium')
  })

  it('posts to correct issues endpoint', async () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.createIssue({ title: 'Issue', description: 'Desc', severity: 'low' })
    const [issueUrl] = fetchSpy.mock.calls[2] as [string, RequestInit]
    expect(issueUrl).toBe('https://gitlab.com/api/v4/projects/42/issues')
  })
})

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------

describe('GitLabProvider — healthCheck', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ok: true when GET /api/v4/user succeeds', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 1, username: 'testuser' })) // GET /user
      .mockResolvedValueOnce(jsonResponse({ version: '16.2.0' }))           // GET /version
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.healthCheck()
    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('calls GET /api/v4/user as the health endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))         // GET /user
      .mockResolvedValueOnce(jsonResponse({ version: '16.0.0' })) // GET /version
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.healthCheck()
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gitlab.com/api/v4/user')
  })

  it('returns ok: false when GET /api/v4/user responds with 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }))
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.healthCheck()
    expect(result.ok).toBe(false)
  })

  it('returns ok: false when fetch throws (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.healthCheck()
    expect(result.ok).toBe(false)
  })

  it('warns when GitLab version is below 14.0', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))              // GET /user
      .mockResolvedValueOnce(jsonResponse({ version: '13.12.0' })) // GET /version
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.healthCheck()
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('13.12.0')
    expect(warnSpy.mock.calls[0][0]).toContain('14.0')
  })

  it('does not warn when GitLab version is 14.0 or above', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))              // GET /user
      .mockResolvedValueOnce(jsonResponse({ version: '16.5.0' }))  // GET /version
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.healthCheck()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('still returns ok: true when version detection fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))   // GET /user ok
      .mockRejectedValueOnce(new Error('timeout'))      // GET /version fails
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.healthCheck()
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// addComment
// ---------------------------------------------------------------------------

describe('GitLabProvider — addComment', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls correct notes endpoint using IID', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ id: 100, body: 'A comment' }),
    )
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.addComment('12', 'Test comment body')
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gitlab.com/api/v4/projects/42/issues/12/notes')
    const body = JSON.parse(init.body as string)
    expect(body.body).toBe('Test comment body')
  })
})

// ---------------------------------------------------------------------------
// Authentication headers
// ---------------------------------------------------------------------------

describe('GitLabProvider — authentication', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends Private-Token header with all requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ id: 1 }))         // GET /user
      .mockResolvedValueOnce(jsonResponse({ version: '16.0.0' })) // GET /version
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.healthCheck()
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Private-Token']).toBe('glpat-test-token')
  })
})

// ---------------------------------------------------------------------------
// label cache — second createIssue reuses cached labels
// ---------------------------------------------------------------------------

describe('GitLabProvider — label cache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches labels only once across multiple createIssue calls on the same instance', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse([{ name: 'critical' }]))  // GET /labels — only once
      .mockResolvedValueOnce(jsonResponse({ iid: 1, web_url: 'https://gitlab.com/acme/repo/-/issues/1' }))
      .mockResolvedValueOnce(jsonResponse({ iid: 2, web_url: 'https://gitlab.com/acme/repo/-/issues/2' }))

    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.createIssue({ title: 'First', description: 'D', severity: 'critical' })
    await provider.createIssue({ title: 'Second', description: 'D', severity: 'critical' })

    // 3 calls total: 1 GET /labels + 2 POST /issues (no second GET /labels)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    const labelGetCalls = fetchSpy.mock.calls.filter(([url]) =>
      (url as string).includes('/labels'),
    )
    expect(labelGetCalls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// updateIssue
// ---------------------------------------------------------------------------

describe('GitLabProvider — updateIssue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls correct issues endpoint with PUT', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.updateIssue('7', { title: 'Updated title' })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gitlab.com/api/v4/projects/42/issues/7')
    expect(init.method).toBe('PUT')
  })

  it('sends only provided patch fields', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.updateIssue('7', { title: 'New title' })
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.title).toBe('New title')
    expect(body).not.toHaveProperty('description')
  })

  it('resolves to undefined (void)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.updateIssue('7', { description: 'New desc' })
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// closeIssue
// ---------------------------------------------------------------------------

describe('GitLabProvider — closeIssue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls correct issues endpoint with PUT and state_event close', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
    const provider = new GitLabProvider(BASE_CONFIG)
    await provider.closeIssue('5')
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gitlab.com/api/v4/projects/42/issues/5')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body as string)
    expect(body.state_event).toBe('close')
  })

  it('resolves to undefined (void)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    const provider = new GitLabProvider(BASE_CONFIG)
    const result = await provider.closeIssue('5')
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// provider name
// ---------------------------------------------------------------------------

describe('GitLabProvider — name', () => {
  it('has readonly name "gitlab"', () => {
    const provider = new GitLabProvider(BASE_CONFIG)
    expect(provider.name).toBe('gitlab')
  })
})
