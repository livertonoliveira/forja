import type { BitbucketConfig } from '../schemas/config.js'
import type { IntegrationProvider, IssueInput, IssueOutput, PRInput, PROutput } from './base.js'
import { registerProviderFactory } from './factory.js'
import { withRetry, HttpError } from '../hooks/retry.js'

const BASE_URL = 'https://api.bitbucket.org'
const SHA_RE = /^[0-9a-f]{7,40}$/i

export type BuildState = 'INPROGRESS' | 'SUCCESSFUL' | 'FAILED'

export interface BuildStatusInput {
  state: BuildState
  key: string
  name: string
  url: string
  description?: string
}

export class BitbucketProvider implements IntegrationProvider {
  readonly name = 'bitbucket'
  private readonly _config: BitbucketConfig
  private readonly _authHeader: string
  private _hasIssues: boolean | null = null
  private _fallbackPR: { id: string; url: string } | null = null

  constructor(config: BitbucketConfig) {
    this._config = config
    if (config.accessToken !== undefined) {
      this._authHeader = `Bearer ${config.accessToken}`
    } else if (config.username !== undefined && config.appPassword !== undefined) {
      const creds = Buffer.from(`${config.username}:${config.appPassword}`).toString('base64')
      this._authHeader = `Basic ${creds}`
    } else {
      throw new Error('[bitbucket] Config must provide either accessToken or username+appPassword')
    }
  }

  private get _repoBase(): string {
    return `${BASE_URL}/2.0/repositories/${this._config.workspace}/${this._config.repoSlug}`
  }

  private async _request<T>(
    method: string,
    url: string,
    body?: unknown,
    timeoutMs = 10_000
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this._authHeader,
      Accept: 'application/json',
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    const result = await withRetry(
      async () => {
        const r = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!r.ok) {
          throw new HttpError(r.status, r.headers.get('Retry-After'))
        }
        return r
      },
      undefined,
      async (err) => { throw err },
      'bitbucket',
    ) as Response
    if (result.status === 204) return undefined as T
    return result.json() as Promise<T>
  }

  private async _checkHasIssues(): Promise<boolean> {
    if (this._hasIssues !== null) return this._hasIssues
    const repo = await this._request<{ has_issues: boolean }>('GET', this._repoBase)
    this._hasIssues = repo.has_issues
    return this._hasIssues
  }

  private async _getLatestOpenPR(): Promise<{ id: string; url: string } | null> {
    if (this._fallbackPR !== null) return this._fallbackPR
    const result = await this._request<{
      values: Array<{ id: number; links: { html: { href: string } } }>
    }>('GET', `${this._repoBase}/pullrequests?state=OPEN&pagelen=1`)
    if (result.values.length === 0) return null
    const pr = result.values[0]
    this._fallbackPR = { id: String(pr.id), url: pr.links.html.href }
    return this._fallbackPR
  }

  async createIssue(input: IssueInput): Promise<IssueOutput> {
    const hasIssues = await this._checkHasIssues()
    if (!hasIssues) {
      const pr = await this._getLatestOpenPR()
      if (!pr) throw new Error('[bitbucket] No open PRs found for issues fallback comment')
      await this.addComment(pr.id, `**[${input.severity.toUpperCase()}] ${input.title}**\n\n${input.description}`)
      return { id: pr.id, url: pr.url, provider: this.name }
    }
    const issue = await this._request<{ id: number; links: { html: { href: string } } }>(
      'POST',
      `${this._repoBase}/issues`,
      {
        title: input.title,
        content: { raw: input.description },
        kind: 'bug',
        priority: input.severity === 'critical' || input.severity === 'high' ? 'critical' : 'major',
      }
    )
    return { id: String(issue.id), url: issue.links.html.href, provider: this.name }
  }

  async updateIssue(id: string, patch: Partial<IssueInput>): Promise<void> {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.description !== undefined) body.content = { raw: patch.description }
    await this._request('PUT', `${this._repoBase}/issues/${id}`, body)
  }

  async closeIssue(id: string): Promise<void> {
    await this._request('PUT', `${this._repoBase}/issues/${id}`, { status: 'resolved' })
  }

  async createPR(input: PRInput): Promise<PROutput> {
    const pr = await this._request<{ id: number; links: { html: { href: string } } }>(
      'POST',
      `${this._repoBase}/pullrequests`,
      {
        title: input.title,
        description: input.body,
        source: { branch: { name: input.branch } },
        destination: { branch: { name: input.base } },
        close_source_branch: false,
      }
    )
    return { id: String(pr.id), url: pr.links.html.href, provider: this.name }
  }

  async addComment(issueId: string, body: string): Promise<void> {
    await this._request('POST', `${this._repoBase}/pullrequests/${issueId}/comments`, {
      content: { raw: body },
    })
  }

  async setBuildStatus(sha: string, input: BuildStatusInput): Promise<void> {
    if (!SHA_RE.test(sha)) throw new Error(`[bitbucket] Invalid commit SHA: ${sha}`)
    await this._request(
      'POST',
      `${this._repoBase}/commit/${sha}/statuses/build`,
      {
        state: input.state,
        key: input.key,
        name: input.name,
        url: input.url,
        description: input.description ?? '',
      }
    )
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now()
    try {
      await this._request('GET', `${BASE_URL}/2.0/user`, undefined, 3_000)
      return { ok: true, latencyMs: Date.now() - start }
    } catch {
      return { ok: false, latencyMs: Date.now() - start }
    }
  }
}

registerProviderFactory((config) => {
  if (!config.bitbucket) return null
  return new BitbucketProvider(config.bitbucket)
})
