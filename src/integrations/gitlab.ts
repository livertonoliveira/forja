import type { GitLabConfig } from '../schemas/config.js'
import type { IntegrationProvider, IssueInput, IssueOutput, PRInput, PROutput } from './base.js'
import { registerProviderFactory } from './factory.js'
import { withRetry, HttpError } from '../hooks/retry.js'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF0000',
  high: '#FF7F00',
  medium: '#FFFF00',
  low: '#00CC00',
}

export class GitLabProvider implements IntegrationProvider {
  readonly name = 'gitlab'
  private readonly _config: GitLabConfig
  private readonly _headers: Record<string, string>
  private _apiVersion: string | null = null
  private _knownLabels: Set<string> | null = null

  constructor(config: GitLabConfig) {
    this._config = config
    this._headers = {
      'Private-Token': config.token,
      'Content-Type': 'application/json',
    }
  }

  private get _base(): string {
    return `${this._config.baseUrl}/api/v4`
  }

  private get _projectBase(): string {
    const id = this._config.projectId
    if (!id) throw new Error('[forja] GitLab projectId is required for project-scoped operations')
    return `${this._base}/projects/${id}`
  }

  private async _get<T>(url: string, timeoutMs = 10_000): Promise<T> {
    const result = await withRetry(
      async () => {
        const r = await fetch(url, {
          headers: this._headers,
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!r.ok) throw new HttpError(r.status, r.headers.get('Retry-After'))
        return r
      },
      undefined,
      async (err) => { throw err },
      'gitlab',
    ) as Response
    try {
      return await result.json() as T
    } catch {
      throw new Error(`[forja] GitLab GET → invalid JSON response`)
    }
  }

  private async _post<T>(url: string, body: unknown, timeoutMs = 10_000): Promise<T> {
    const result = await withRetry(
      async () => {
        const r = await fetch(url, {
          method: 'POST',
          headers: this._headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!r.ok) throw new HttpError(r.status, r.headers.get('Retry-After'))
        return r
      },
      undefined,
      async (err) => { throw err },
      'gitlab',
    ) as Response
    try {
      return await result.json() as T
    } catch {
      throw new Error(`[forja] GitLab POST → invalid JSON response`)
    }
  }

  private async _put(url: string, body: unknown, timeoutMs = 10_000): Promise<void> {
    await withRetry(
      async () => {
        const r = await fetch(url, {
          method: 'PUT',
          headers: this._headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!r.ok) throw new HttpError(r.status, r.headers.get('Retry-After'))
      },
      undefined,
      async (err) => { throw err },
      'gitlab',
    )
  }

  private async _detectVersion(): Promise<string> {
    if (this._apiVersion !== null) return this._apiVersion
    try {
      const data = await this._get<{ version: string }>(`${this._base}/version`)
      this._apiVersion = data.version
    } catch {
      this._apiVersion = 'unknown'
    }
    return this._apiVersion
  }

  private async _ensureLabel(name: string): Promise<void> {
    if (this._knownLabels === null) {
      const existing = await this._get<Array<{ name: string }>>(`${this._projectBase}/labels?per_page=100`)
      this._knownLabels = new Set(existing.map(l => l.name))
    }
    if (this._knownLabels.has(name)) return
    await this._post(`${this._projectBase}/labels`, {
      name,
      color: SEVERITY_COLORS[name] ?? '#6699CC',
    })
    this._knownLabels.add(name)
  }

  async createIssue(input: IssueInput): Promise<IssueOutput> {
    const severityLabel = input.severity.toLowerCase()
    await this._ensureLabel(severityLabel)

    const extraLabels = input.labels ?? []
    const allLabels = Array.from(new Set([severityLabel, ...extraLabels]))

    const data = await this._post<{ iid: number; web_url: string }>(
      `${this._projectBase}/issues`,
      {
        title: input.title,
        description: input.description,
        labels: allLabels.join(','),
      },
    )
    return { id: String(data.iid), url: data.web_url, provider: this.name }
  }

  async updateIssue(id: string, patch: Partial<IssueInput>): Promise<void> {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.description !== undefined) body.description = patch.description
    await this._put(`${this._projectBase}/issues/${id}`, body)
  }

  async closeIssue(id: string): Promise<void> {
    await this._put(`${this._projectBase}/issues/${id}`, { state_event: 'close' })
  }

  async createPR(input: PRInput): Promise<PROutput> {
    const data = await this._post<{ iid: number; web_url: string }>(
      `${this._projectBase}/merge_requests`,
      {
        title: input.title,
        description: input.body,
        source_branch: input.branch,
        target_branch: input.base,
      },
    )
    return { id: String(data.iid), url: data.web_url, provider: this.name }
  }

  async addComment(issueId: string, body: string): Promise<void> {
    await this._post(`${this._projectBase}/issues/${issueId}/notes`, { body })
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now()
    try {
      const res = await fetch(`${this._base}/user`, {
        headers: this._headers,
        signal: AbortSignal.timeout(3_000),
      })
      const latencyMs = Date.now() - start
      if (!res.ok) return { ok: false, latencyMs }

      const version = await this._detectVersion()
      if (version !== 'unknown') {
        const major = parseInt(version.split('.')[0], 10)
        if (!isNaN(major) && major < 14) {
          console.warn(`[forja] GitLab version ${version} is below 14.0 — some features may not be available`)
        }
      }

      return { ok: true, latencyMs }
    } catch {
      return { ok: false, latencyMs: Date.now() - start }
    }
  }
}

export function createGitLabProvider(config: GitLabConfig): GitLabProvider {
  return new GitLabProvider(config)
}

registerProviderFactory((config) => {
  if (!config.gitlab) return null
  return createGitLabProvider(config.gitlab)
})
