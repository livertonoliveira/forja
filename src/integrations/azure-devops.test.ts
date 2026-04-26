import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AzureDevOpsProvider, NotImplementedError, createAzureDevOpsProvider } from './azure-devops.js'
import type { AzureDevOpsConfig } from '../schemas/config.js'

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

afterEach(() => {
  vi.restoreAllMocks()
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

describe('AzureDevOpsProvider — unimplemented methods', () => {
  let provider: AzureDevOpsProvider

  beforeEach(() => {
    provider = new AzureDevOpsProvider(BASE_CONFIG)
  })

  it('createPR throws NotImplementedError', async () => {
    await expect(
      provider.createPR({ title: 'PR', body: 'body', branch: 'feature', base: 'main' })
    ).rejects.toBeInstanceOf(NotImplementedError)
  })

  it('updateIssue throws NotImplementedError', async () => {
    await expect(
      provider.updateIssue('1', { title: 'Updated' })
    ).rejects.toBeInstanceOf(NotImplementedError)
  })

  it('closeIssue throws NotImplementedError', async () => {
    await expect(
      provider.closeIssue('1')
    ).rejects.toBeInstanceOf(NotImplementedError)
  })
})

describe('createAzureDevOpsProvider — factory function', () => {
  it('returns an AzureDevOpsProvider instance', () => {
    const provider = createAzureDevOpsProvider(BASE_CONFIG)
    expect(provider).toBeInstanceOf(AzureDevOpsProvider)
    expect(provider.name).toBe('azure-devops')
  })
})
