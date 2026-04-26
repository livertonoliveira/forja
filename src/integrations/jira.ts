import type { JiraConfig } from '../schemas/config.js'
import type { IntegrationProvider, IssueInput, IssueOutput, PRInput, PROutput } from './base.js'
import { registerProviderFactory } from './factory.js'

// NotImplementedError class (exported for tests)
export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`NotImplementedError: ${method} is not yet implemented in JiraProvider`)
    this.name = 'NotImplementedError'
  }
}

interface JiraTransition {
  id: string
  name: string
}

interface JiraTransitionsResponse {
  transitions: JiraTransition[]
}

const CLOSE_FALLBACKS = ['Done', 'Closed', 'Resolved', 'Completed'] as const

const SEVERITY_TO_PRIORITY: Record<string, string> = {
  critical: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

// ADF (Atlassian Document Format) minimal structure
function adf(text: string) {
  return {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const ISSUE_ID_RE = /^[A-Z][A-Z0-9_]+-\d+$/

export class JiraProvider implements IntegrationProvider {
  readonly name = 'jira'
  private readonly _config: JiraConfig
  private readonly _headers: Record<string, string>

  constructor(config: JiraConfig) {
    if (!config.baseUrl.startsWith('https://')) {
      throw new Error('[forja] JiraProvider: baseUrl must use HTTPS to protect credentials')
    }
    this._config = config
    this._headers = {
      Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  // Rate limited: max 10 req/s (100ms between calls)
  private async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await sleep(100)
    const res = await fetch(`${this._config.baseUrl}${path}`, {
      method,
      headers: this._headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401) {
      throw new Error(
        'Token Jira inválido ou expirado. Gere novo em: https://id.atlassian.com/manage-profile/security/api-tokens',
      )
    }
    if (!res.ok) {
      throw new Error(`[forja] Jira API error: ${res.status} ${method} ${path}`)
    }
    return res.json() as Promise<T>
  }

  private async _getTransitions(issueId: string): Promise<JiraTransition[]> {
    if (!ISSUE_ID_RE.test(issueId)) {
      throw new Error(`[forja] JiraProvider: invalid issueId format: ${issueId}`)
    }
    const data = await this._request<JiraTransitionsResponse>(
      'GET',
      `/rest/api/3/issue/${issueId}/transitions`,
    )
    return data.transitions
  }

  async createIssue(input: IssueInput): Promise<IssueOutput> {
    const data = await this._request<{ id: string; key: string }>('POST', '/rest/api/3/issue', {
      fields: {
        project: { key: this._config.projectKey },
        summary: input.title,
        description: adf(input.description),
        issuetype: { name: 'Bug' },
        priority: { name: SEVERITY_TO_PRIORITY[input.severity] ?? 'Medium' },
        labels: input.labels ?? [],
      },
    })
    return { id: data.id, url: `${this._config.baseUrl}/browse/${data.key}`, provider: 'jira' }
  }

  async updateIssue(id: string, patch: Partial<IssueInput>): Promise<void> {
    const unsupportedFields = Object.keys(patch).filter(k => k !== 'status')
    if (unsupportedFields.length > 0) {
      throw new NotImplementedError(`updateIssue with fields: ${unsupportedFields.join(', ')}`)
    }

    const statusName = (patch as Record<string, unknown>)['status'] as string | undefined
    if (!statusName) return

    const transitions = await this._getTransitions(id)
    const found = transitions.find(t => t.name.toLowerCase() === statusName.toLowerCase())

    if (!found) {
      const available = transitions.map(t => t.name).join(', ')
      const safeName = statusName.slice(0, 100)
      throw new Error(
        `[forja] JiraProvider: transition "${safeName}" not available. Available: ${available}`
      )
    }

    await this._request('POST', `/rest/api/3/issue/${id}/transitions`, {
      transition: { id: found.id },
    })
  }

  async closeIssue(id: string): Promise<void> {
    const transitions = await this._getTransitions(id)

    for (const name of CLOSE_FALLBACKS) {
      const found = transitions.find(t => t.name.toLowerCase() === name.toLowerCase())
      if (found) {
        await this._request('POST', `/rest/api/3/issue/${id}/transitions`, {
          transition: { id: found.id },
        })
        return
      }
    }

    throw new Error(
      `[forja] JiraProvider: closeIssue — none of [${CLOSE_FALLBACKS.join(', ')}] available. Current transitions: ${transitions.map(t => t.name).join(', ')}`
    )
  }

  async createPR(_input: PRInput): Promise<PROutput> {
    throw new NotImplementedError('createPR')
  }

  async addComment(issueId: string, body: string): Promise<void> {
    if (!ISSUE_ID_RE.test(issueId)) {
      throw new Error(`[forja] JiraProvider: invalid issueId format: ${issueId}`)
    }
    await this._request('POST', `/rest/api/3/issue/${issueId}/comment`, { body: adf(body) })
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now()
    try {
      const res = await fetch(`${this._config.baseUrl}/rest/api/3/myself`, {
        headers: this._headers,
        signal: AbortSignal.timeout(3_000),
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    } catch {
      return { ok: false, latencyMs: Date.now() - start }
    }
  }
}

// Register factory — auto-activated when this module is imported
registerProviderFactory((config) => {
  if (!config.jira) return null
  return new JiraProvider(config.jira)
})
