import { describe, it, expect, vi, afterEach } from 'vitest'
import { BitbucketProvider } from './bitbucket.js'
import type { BitbucketConfig } from '../schemas/config.js'
import { resetCircuitBreakers } from '../hooks/circuit-breaker.js'

const BASIC_CONFIG: BitbucketConfig = {
  workspace: 'acme',
  repoSlug: 'my-repo',
  username: 'user@example.com',
  appPassword: 'APP_PASSWORD',
}

const OAUTH_CONFIG: BitbucketConfig = {
  workspace: 'acme',
  repoSlug: 'my-repo',
  accessToken: 'oauth-access-token',
}

const REPO_BASE = 'https://api.bitbucket.org/2.0/repositories/acme/my-repo'

const PR_ITEM = (id: number) => ({
  id,
  links: { html: { href: `https://bitbucket.org/acme/my-repo/pull-requests/${id}` } },
})

type MockResponse = { status: number; body?: unknown }

function mockFetch(...responses: MockResponse[]) {
  let idx = 0
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const r = responses[idx++] ?? { status: 200, body: {} }
    return Promise.resolve(new Response(JSON.stringify(r.body ?? {}), { status: r.status }))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  resetCircuitBreakers()
})

// ---------------------------------------------------------------------------
// createPR
// ---------------------------------------------------------------------------

describe('BitbucketProvider — createPR', () => {
  it('posts to pullrequests endpoint and returns PROutput', async () => {
    const fetchSpy = mockFetch({ status: 201, body: PR_ITEM(42) })
    const provider = new BitbucketProvider(BASIC_CONFIG)

    const result = await provider.createPR({
      title: 'feat: quality report',
      body: '## Quality Report\n\nAll gates passed.',
      branch: 'feature/abc',
      base: 'main',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${REPO_BASE}/pullrequests`)
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.title).toBe('feat: quality report')
    expect(body.description).toBe('## Quality Report\n\nAll gates passed.')
    expect((body.source as { branch: { name: string } }).branch.name).toBe('feature/abc')
    expect((body.destination as { branch: { name: string } }).branch.name).toBe('main')
    expect(result).toEqual({
      id: '42',
      url: 'https://bitbucket.org/acme/my-repo/pull-requests/42',
      provider: 'bitbucket',
    })
  })

  it('sends Basic Auth header from username:appPassword', async () => {
    const fetchSpy = mockFetch({ status: 201, body: PR_ITEM(1) })
    const provider = new BitbucketProvider(BASIC_CONFIG)
    await provider.createPR({ title: 't', body: 'b', branch: 'feat', base: 'main' })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const authHeader = (init.headers as Record<string, string>).Authorization
    expect(authHeader).toMatch(/^Basic /)
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString()
    expect(decoded).toBe('user@example.com:APP_PASSWORD')
  })

  it('throws on non-ok response', async () => {
    mockFetch({ status: 400, body: { error: { message: 'Bad request' } } })
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await expect(
      provider.createPR({ title: 't', body: 'b', branch: 'feat', base: 'main' })
    ).rejects.toThrow('[bitbucket]')
  })
})

// ---------------------------------------------------------------------------
// createIssue — Issues enabled (has_issues: true)
// ---------------------------------------------------------------------------

describe('BitbucketProvider — createIssue with Issues enabled', () => {
  it('creates an issue when has_issues is true', async () => {
    const fetchSpy = mockFetch(
      { status: 200, body: { has_issues: true } },
      { status: 201, body: { id: 7, links: { html: { href: 'https://bitbucket.org/acme/my-repo/issues/7' } } } }
    )
    const provider = new BitbucketProvider(BASIC_CONFIG)

    const result = await provider.createIssue({
      title: 'SQL injection in input',
      description: 'User input not sanitized.',
      severity: 'high',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [url2, init2] = fetchSpy.mock.calls[1] as [string, RequestInit]
    expect(url2).toBe(`${REPO_BASE}/issues`)
    expect(init2.method).toBe('POST')
    const body = JSON.parse(init2.body as string) as Record<string, unknown>
    expect(body.title).toBe('SQL injection in input')
    expect(body.priority).toBe('critical')
    expect(result).toEqual({ id: '7', url: 'https://bitbucket.org/acme/my-repo/issues/7', provider: 'bitbucket' })
  })

  it('uses major priority for medium/low severity', async () => {
    const fetchSpy = mockFetch(
      { status: 200, body: { has_issues: true } },
      { status: 201, body: { id: 8, links: { html: { href: 'https://bitbucket.org/acme/my-repo/issues/8' } } } }
    )
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.createIssue({ title: 'Minor lint issue', description: 'desc', severity: 'low' })

    const [, init2] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(init2.body as string) as { priority: string }
    expect(body.priority).toBe('major')
  })

  it('caches the has_issues check across multiple createIssue calls', async () => {
    const fetchSpy = mockFetch(
      { status: 200, body: { has_issues: true } },
      { status: 201, body: { id: 10, links: { html: { href: 'https://bb.org/issues/10' } } } },
      { status: 201, body: { id: 11, links: { html: { href: 'https://bb.org/issues/11' } } } }
    )
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.createIssue({ title: 'Issue A', description: 'd', severity: 'low' })
    await provider.createIssue({ title: 'Issue B', description: 'd', severity: 'low' })

    // 1 repo check + 2 issue creates = 3 (not 4)
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})

// ---------------------------------------------------------------------------
// createIssue — Issues disabled (has_issues: false) — fallback
// ---------------------------------------------------------------------------

describe('BitbucketProvider — createIssue fallback when Issues disabled', () => {
  it('falls back to PR comment when has_issues is false', async () => {
    const fetchSpy = mockFetch(
      { status: 200, body: { has_issues: false } },
      { status: 200, body: { values: [PR_ITEM(99)] } },
      { status: 201, body: {} }
    )
    const provider = new BitbucketProvider(BASIC_CONFIG)

    const result = await provider.createIssue({
      title: 'Security finding',
      description: 'Detailed description.',
      severity: 'critical',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(3)

    const [prListUrl] = fetchSpy.mock.calls[1] as [string]
    expect(prListUrl).toContain('/pullrequests?state=OPEN')

    const [commentUrl, commentInit] = fetchSpy.mock.calls[2] as [string, RequestInit]
    expect(commentUrl).toBe(`${REPO_BASE}/pullrequests/99/comments`)
    const commentBody = JSON.parse(commentInit.body as string) as { content: { raw: string } }
    expect(commentBody.content.raw).toContain('[CRITICAL] Security finding')
    expect(commentBody.content.raw).toContain('Detailed description.')

    expect(result.id).toBe('99')
    expect(result.url).toBe('https://bitbucket.org/acme/my-repo/pull-requests/99')
    expect(result.provider).toBe('bitbucket')
  })

  it('caches the fallback PR lookup across multiple createIssue fallback calls', async () => {
    const fetchSpy = mockFetch(
      { status: 200, body: { has_issues: false } },
      { status: 200, body: { values: [PR_ITEM(99)] } },
      { status: 201, body: {} },
      { status: 201, body: {} }
    )
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.createIssue({ title: 'Issue A', description: 'd', severity: 'low' })
    await provider.createIssue({ title: 'Issue B', description: 'd', severity: 'low' })

    // 1 repo check + 1 PR list + 2 comments = 4 (not 5)
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('throws when no open PRs exist for fallback', async () => {
    mockFetch(
      { status: 200, body: { has_issues: false } },
      { status: 200, body: { values: [] } }
    )
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await expect(
      provider.createIssue({ title: 't', description: 'd', severity: 'low' })
    ).rejects.toThrow('No open PRs found')
  })
})

// ---------------------------------------------------------------------------
// setBuildStatus
// ---------------------------------------------------------------------------

describe('BitbucketProvider — setBuildStatus', () => {
  it('posts INPROGRESS state to commit statuses endpoint', async () => {
    const fetchSpy = mockFetch({ status: 200, body: {} })
    const provider = new BitbucketProvider(BASIC_CONFIG)
    const sha = 'abc123def456'

    await provider.setBuildStatus(sha, {
      state: 'INPROGRESS',
      key: 'forja-pipeline',
      name: 'Forja Pipeline',
      url: 'https://forja.example.com/runs/run-1',
    })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${REPO_BASE}/commit/${sha}/statuses/build`)
    const body = JSON.parse(init.body as string) as { state: string; key: string }
    expect(body.state).toBe('INPROGRESS')
    expect(body.key).toBe('forja-pipeline')
  })

  it('posts SUCCESSFUL state', async () => {
    const fetchSpy = mockFetch({ status: 200, body: {} })
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.setBuildStatus('a1b2c3d4e5f6', {
      state: 'SUCCESSFUL',
      key: 'forja-pipeline',
      name: 'Forja Pipeline',
      url: 'https://forja.example.com/runs/run-1',
      description: 'All gates passed',
    })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { state: string; description: string }
    expect(body.state).toBe('SUCCESSFUL')
    expect(body.description).toBe('All gates passed')
  })

  it('posts FAILED state', async () => {
    const fetchSpy = mockFetch({ status: 200, body: {} })
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.setBuildStatus('deadbeef1234', {
      state: 'FAILED',
      key: 'forja-pipeline',
      name: 'Forja Pipeline',
      url: 'https://forja.example.com/runs/run-1',
    })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { state: string }
    expect(body.state).toBe('FAILED')
  })

  it('throws on invalid SHA format', async () => {
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await expect(
      provider.setBuildStatus('../etc/passwd', {
        state: 'INPROGRESS',
        key: 'k',
        name: 'n',
        url: 'https://x.com',
      })
    ).rejects.toThrow('Invalid commit SHA')
  })

  it('accepts short (7-char) SHA', async () => {
    mockFetch({ status: 200, body: {} })
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await expect(
      provider.setBuildStatus('abc1234', {
        state: 'INPROGRESS',
        key: 'k',
        name: 'n',
        url: 'https://x.com',
      })
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// healthCheck
// ---------------------------------------------------------------------------

describe('BitbucketProvider — healthCheck', () => {
  it('returns ok:true with latencyMs when /2.0/user returns 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const provider = new BitbucketProvider(BASIC_CONFIG)

    const result = await provider.healthCheck()

    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('returns ok:false when /2.0/user returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    const provider = new BitbucketProvider(BASIC_CONFIG)

    const result = await provider.healthCheck()

    expect(result.ok).toBe(false)
  })

  it('returns ok:false when fetch throws (network error)', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const provider = new BitbucketProvider(BASIC_CONFIG)

    const p = provider.healthCheck()
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.ok).toBe(false)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    vi.useRealTimers()
  })

  it('calls /2.0/user endpoint with Authorization header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.healthCheck()

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.bitbucket.org/2.0/user')
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /)
  })
})

// ---------------------------------------------------------------------------
// OAuth 2.0 — accessToken auth
// ---------------------------------------------------------------------------

describe('BitbucketProvider — OAuth 2.0 via accessToken', () => {
  it('uses Bearer token when accessToken is provided', async () => {
    const fetchSpy = mockFetch({ status: 201, body: PR_ITEM(5) })
    const provider = new BitbucketProvider(OAUTH_CONFIG)

    await provider.createPR({ title: 't', body: 'b', branch: 'feat', base: 'main' })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const authHeader = (init.headers as Record<string, string>).Authorization
    expect(authHeader).toBe('Bearer oauth-access-token')
  })

  it('healthCheck uses Bearer token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const provider = new BitbucketProvider(OAUTH_CONFIG)

    await provider.healthCheck()

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer oauth-access-token')
  })
})

// ---------------------------------------------------------------------------
// updateIssue / closeIssue
// ---------------------------------------------------------------------------

describe('BitbucketProvider — updateIssue', () => {
  it('sends PUT request with patched fields', async () => {
    const fetchSpy = mockFetch({ status: 200, body: {} })
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.updateIssue('5', { title: 'New title', description: 'New desc' })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${REPO_BASE}/issues/5`)
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body as string) as { title: string; content: { raw: string } }
    expect(body.title).toBe('New title')
    expect(body.content.raw).toBe('New desc')
  })
})

describe('BitbucketProvider — closeIssue', () => {
  it('sends PUT with status:resolved', async () => {
    const fetchSpy = mockFetch({ status: 200, body: {} })
    const provider = new BitbucketProvider(BASIC_CONFIG)

    await provider.closeIssue('5')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${REPO_BASE}/issues/5`)
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body as string) as { status: string }
    expect(body.status).toBe('resolved')
  })
})

// ---------------------------------------------------------------------------
// constructor — invalid config
// ---------------------------------------------------------------------------

describe('BitbucketProvider — constructor validation', () => {
  it('throws when neither accessToken nor username+appPassword provided', () => {
    expect(() => new BitbucketProvider({ workspace: 'ws', repoSlug: 'repo' } as BitbucketConfig))
      .toThrow('accessToken or username+appPassword')
  })
})
