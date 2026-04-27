import { describe, it, expect, vi, afterEach } from 'vitest'
import { AzureDevOpsProvider, createAzureDevOpsProvider } from './azure-devops.js'
import type { AzureDevOpsConfig } from '../schemas/config.js'
import { resetCircuitBreakers } from '../hooks/circuit-breaker.js'

const BASE_CONFIG: AzureDevOpsConfig = {
  orgUrl: 'https://dev.azure.com/myorg',
  project: 'myproject',
  token: 'test-token',
}

describe('AzureDevOpsProvider — constructor validation', () => {
  it('throws when orgUrl is not HTTPS', () => {
    expect(() => new AzureDevOpsProvider({ ...BASE_CONFIG, orgUrl: 'http://dev.azure.com/myorg' })).toThrow(/HTTPS/)
  })

  it('throws when orgUrl is not an Azure DevOps domain', () => {
    expect(() => new AzureDevOpsProvider({ ...BASE_CONFIG, orgUrl: 'https://attacker.internal/myorg' })).toThrow(/azure\.com/)
  })
})

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let i = 0
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const r = responses[i++] ?? responses[responses.length - 1]
    return new Response(JSON.stringify(r.body), { status: r.status })
  })
}

function makeTemplateResponse(templateName: string) {
  return {
    status: 200,
    body: {
      capabilities: {
        processTemplate: { templateName },
      },
    },
  }
}

function makeWorkItemResponse(id = 123) {
  return {
    status: 200,
    body: {
      id,
      _links: { html: { href: `https://dev.azure.com/myorg/myproject/_workitems/edit/${id}` } },
    },
  }
}

function makeReposResponse(repos: Array<{ id: string; name: string }> = [{ id: 'repo-id-1', name: 'myrepo' }]) {
  return { status: 200, body: { value: repos } }
}

function makePRResponse(id = 42) {
  return { status: 200, body: { pullRequestId: id } }
}


afterEach(() => {
  vi.restoreAllMocks()
  resetCircuitBreakers()
})

describe('AzureDevOpsProvider — template detection: Agile', () => {
  it('creates a User Story when template is Agile', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('Agile'), makeWorkItemResponse(1)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createIssue({ title: 'My feature', description: 'desc', severity: 'low' })

    const [url] = fetchSpy.mock.calls[1] as [string]
    expect(url).toContain('User%20Story')
  })
})

describe('AzureDevOpsProvider — template detection: Scrum', () => {
  it('creates a Product Backlog Item when template is Scrum', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('Scrum'), makeWorkItemResponse(2)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createIssue({ title: 'My feature', description: 'desc', severity: 'low' })

    const [url] = fetchSpy.mock.calls[1] as [string]
    expect(url).toContain('Product%20Backlog%20Item')
  })
})

describe('AzureDevOpsProvider — template detection: CMMI', () => {
  it('creates a Requirement when template is CMMI', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('CMMI'), makeWorkItemResponse(3)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createIssue({ title: 'My feature', description: 'desc', severity: 'low' })

    const [url] = fetchSpy.mock.calls[1] as [string]
    expect(url).toContain('Requirement')
  })
})

describe('AzureDevOpsProvider — bug label overrides template', () => {
  it('creates a Bug regardless of template when labels includes bug', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('Agile'), makeWorkItemResponse(4)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createIssue({ title: 'Crash', description: 'desc', severity: 'high', labels: ['bug'] })

    const [url] = fetchSpy.mock.calls[1] as [string]
    expect(url).toContain('Bug')
  })
})

describe('AzureDevOpsProvider — template caching', () => {
  it('does not re-fetch process template on second createIssue call', async () => {
    const fetchSpy = mockFetch([
      makeTemplateResponse('Agile'),
      makeWorkItemResponse(10),
      makeWorkItemResponse(11),
    ])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createIssue({ title: 'First', description: 'desc', severity: 'low' })
    await provider.createIssue({ title: 'Second', description: 'desc', severity: 'medium' })

    const urls = fetchSpy.mock.calls.map(([url]) => url as string)
    const templateFetches = urls.filter(u => u.includes('includeCapabilities=true'))
    expect(templateFetches).toHaveLength(1)
  })
})

describe('AzureDevOpsProvider — addComment', () => {
  it('posts to workItems/:id/comments with api-version=7.1-preview.3', async () => {
    const fetchSpy = mockFetch([{ status: 200, body: {} }])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.addComment('42', 'Hello comment')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('workItems/42/comments')
    expect(url).toContain('api-version=7.1-preview.3')

    const body = JSON.parse(init.body as string) as { text: string }
    expect(body).toEqual({ text: 'Hello comment' })
  })
})

describe('AzureDevOpsProvider — healthCheck', () => {
  it('returns ok:true on 200', async () => {
    mockFetch([{ status: 200, body: {} }])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    const result = await provider.healthCheck()

    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('throws with required PAT scope names on 401', async () => {
    mockFetch([{ status: 401, body: {} }])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await expect(provider.healthCheck()).rejects.toThrow(/vso\.work_write.*vso\.code_write/)
  })

  it('returns ok:false on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failure'))
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    const result = await provider.healthCheck()

    expect(result.ok).toBe(false)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })
})

describe('AzureDevOpsProvider — createPR', () => {
  it('uses first repository when none configured', async () => {
    const fetchSpy = mockFetch([makeReposResponse(), makePRResponse(42)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    const result = await provider.createPR({ title: 'My PR', body: 'report', branch: 'feat', base: 'main' })

    expect(result.id).toBe('42')
    expect(result.url).toBe('https://dev.azure.com/myorg/_git/myrepo/pullrequest/42')
    expect(result.provider).toBe('azure-devops')

    const [reposUrl] = fetchSpy.mock.calls[0] as [string]
    expect(reposUrl).toContain('git/repositories')
    expect(reposUrl).toContain('api-version=7.1')
  })

  it('sends correct PR payload', async () => {
    const fetchSpy = mockFetch([makeReposResponse(), makePRResponse(10)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createPR({ title: 'Fix bug', body: 'quality report', branch: 'fix/bug', base: 'develop' })

    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Record<string, string>
    expect(body.sourceRefName).toBe('refs/heads/fix/bug')
    expect(body.targetRefName).toBe('refs/heads/develop')
    expect(body.title).toBe('Fix bug')
    expect(body.description).toBe('quality report')
  })

  it('matches repository by name when configured', async () => {
    const fetchSpy = mockFetch([
      { status: 200, body: { id: 'id-b', name: 'specific-repo' } },
      makePRResponse(7),
    ])
    const provider = new AzureDevOpsProvider({ ...BASE_CONFIG, repository: 'specific-repo' })

    const result = await provider.createPR({ title: 'PR', body: '', branch: 'feat', base: 'main' })

    expect(result.url).toContain('specific-repo')
    expect(result.url).toContain('/pullrequest/7')
    const [prUrl] = fetchSpy.mock.calls[1] as [string]
    expect(prUrl).toContain('id-b')
  })

  it('throws when configured repository is not found', async () => {
    mockFetch([{ status: 404, body: {} }])
    const provider = new AzureDevOpsProvider({ ...BASE_CONFIG, repository: 'missing-repo' })

    await expect(
      provider.createPR({ title: 'PR', body: '', branch: 'feat', base: 'main' })
    ).rejects.toThrow(/missing-repo/)
  })
})

describe('AzureDevOpsProvider — _resolveRepository caching', () => {
  it('does not re-fetch repository on second createPR call', async () => {
    const fetchSpy = mockFetch([
      makeReposResponse(),
      makePRResponse(1),
      makePRResponse(2),
    ])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createPR({ title: 'PR 1', body: '', branch: 'feat', base: 'main' })
    await provider.createPR({ title: 'PR 2', body: '', branch: 'feat', base: 'main' })

    const urls = fetchSpy.mock.calls.map(([url]) => url as string)
    const repoFetches = urls.filter(u => u.includes('git/repositories') && !u.includes('pullrequests'))
    expect(repoFetches).toHaveLength(1)
  })
})

describe('AzureDevOpsProvider — numeric ID validation', () => {
  it('updateIssue throws on non-numeric id', async () => {
    const provider = new AzureDevOpsProvider(BASE_CONFIG)
    await expect(provider.updateIssue('abc', { title: 'x' })).rejects.toThrow(/numeric/)
  })

  it('closeIssue throws on non-numeric id', async () => {
    const provider = new AzureDevOpsProvider(BASE_CONFIG)
    await expect(provider.closeIssue('abc')).rejects.toThrow(/numeric/)
  })

  it('createIssue throws on non-numeric parentId', async () => {
    mockFetch([makeTemplateResponse('Agile')])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)
    await expect(
      provider.createIssue({ title: 'x', description: 'd', severity: 'low', parentId: 'not-a-number' })
    ).rejects.toThrow(/numeric/)
  })
})

describe('AzureDevOpsProvider — createIssue with parentId', () => {
  it('adds Hierarchy-Reverse relation when parentId is provided', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('Agile'), makeWorkItemResponse(200)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createIssue({ title: 'Child story', description: 'desc', severity: 'low', parentId: '100' })

    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Array<{ op: string; path: string; value: unknown }>
    const relationOp = body.find(op => op.path === '/relations/-')
    expect(relationOp).toBeDefined()
    const value = relationOp!.value as { rel: string; url: string }
    expect(value.rel).toBe('System.LinkTypes.Hierarchy-Reverse')
    expect(value.url).toContain('/workItems/100')
  })

  it('does not add relation when parentId is absent', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('Agile'), makeWorkItemResponse(201)])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.createIssue({ title: 'Standalone', description: 'desc', severity: 'low' })

    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as Array<{ path: string }>
    expect(body.find(op => op.path === '/relations/-')).toBeUndefined()
  })
})

describe('AzureDevOpsProvider — updateIssue', () => {
  it('sends replace ops for provided fields', async () => {
    const fetchSpy = mockFetch([{ status: 200, body: {} }])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.updateIssue('55', { title: 'New title', severity: 'high' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('workitems/55')
    expect(url).toContain('api-version=7.1')

    const ops = JSON.parse(init.body as string) as Array<{ op: string; path: string; value: unknown }>
    expect(ops).toContainEqual({ op: 'replace', path: '/fields/System.Title', value: 'New title' })
    expect(ops).toContainEqual({ op: 'replace', path: '/fields/Microsoft.VSTS.Common.Priority', value: 2 })
    expect(ops.find(o => o.path.includes('Description'))).toBeUndefined()
  })

  it('makes no request when patch is empty', async () => {
    const fetchSpy = mockFetch([])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.updateIssue('55', {})

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('AzureDevOpsProvider — closeIssue', () => {
  it('sets System.State to Closed for Agile template', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('Agile'), { status: 200, body: {} }])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.closeIssue('10')

    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const ops = JSON.parse(init.body as string) as Array<{ op: string; path: string; value: string }>
    expect(ops[0]).toEqual({ op: 'replace', path: '/fields/System.State', value: 'Closed' })
  })

  it('sets System.State to Done for Scrum template', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('Scrum'), { status: 200, body: {} }])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.closeIssue('20')

    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const ops = JSON.parse(init.body as string) as Array<{ op: string; path: string; value: string }>
    expect(ops[0]).toEqual({ op: 'replace', path: '/fields/System.State', value: 'Done' })
  })

  it('sets System.State to Closed for CMMI template', async () => {
    const fetchSpy = mockFetch([makeTemplateResponse('CMMI'), { status: 200, body: {} }])
    const provider = new AzureDevOpsProvider(BASE_CONFIG)

    await provider.closeIssue('30')

    const [, init] = fetchSpy.mock.calls[1] as [string, RequestInit]
    const ops = JSON.parse(init.body as string) as Array<{ op: string; path: string; value: string }>
    expect(ops[0]).toEqual({ op: 'replace', path: '/fields/System.State', value: 'Closed' })
  })
})

describe('createAzureDevOpsProvider — factory function', () => {
  it('returns an AzureDevOpsProvider instance', () => {
    const provider = createAzureDevOpsProvider(BASE_CONFIG)
    expect(provider).toBeInstanceOf(AzureDevOpsProvider)
    expect(provider.name).toBe('azure-devops')
  })
})
