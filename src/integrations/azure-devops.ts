import type { AzureDevOpsConfig } from '../schemas/config.js'
import type { IntegrationProvider, IssueInput, IssueOutput, PRInput, PROutput } from './base.js'
import { registerProviderFactory } from './factory.js'
import { withRetry, HttpError } from '../hooks/retry.js'

export type ProcessTemplate = 'Agile' | 'Scrum' | 'CMMI'

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`AzureDevOpsProvider.${method} is not implemented`)
    this.name = 'NotImplementedError'
  }
}

function mapSeverity(severity: string): number {
  switch (severity) {
    case 'critical': return 1
    case 'high': return 2
    case 'medium': return 3
    default: return 4
  }
}

function assertNumericId(value: string, field: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`[forja] AzureDevOps: ${field} must be a numeric work item ID, got: ${value}`)
  }
}

const AZURE_DOMAIN_RE = /\.(azure\.com|visualstudio\.com)$/

export class AzureDevOpsProvider implements IntegrationProvider {
  readonly name = 'azure-devops'

  private readonly _config: AzureDevOpsConfig
  private readonly _authHeader: string
  private _processTemplate: ProcessTemplate | null = null
  private _repoCache: { id: string; name: string } | null = null

  constructor(config: AzureDevOpsConfig) {
    const parsed = new URL(config.orgUrl)
    if (parsed.protocol !== 'https:' || !AZURE_DOMAIN_RE.test(parsed.hostname)) {
      throw new Error(
        '[forja] AzureDevOpsConfig: orgUrl must be a valid Azure DevOps HTTPS URL (*.azure.com or *.visualstudio.com)'
      )
    }
    this._config = { ...config, orgUrl: config.orgUrl.replace(/\/$/, '') }
    this._authHeader = 'Basic ' + Buffer.from(':' + config.token).toString('base64')
  }

  private _headers(contentType = 'application/json'): Record<string, string> {
    return { Authorization: this._authHeader, 'Content-Type': contentType }
  }

  private async _request(
    url: string,
    init: Omit<RequestInit, 'signal'>,
    errorLabel: string,
    timeoutMs = 10_000,
  ): Promise<Response> {
    return await withRetry(
      async () => {
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
        if (!r.ok) throw new HttpError(r.status, r.headers.get('Retry-After'))
        return r
      },
      undefined,
      async (err) => { throw err },
      'azure-devops',
    ) as Response
  }

  private async detectTemplate(): Promise<ProcessTemplate> {
    if (this._processTemplate !== null) return this._processTemplate

    const { orgUrl, project } = this._config
    const url = `${orgUrl}/_apis/projects/${encodeURIComponent(project)}?includeCapabilities=true&api-version=7.1`

    const res = await this._request(
      url,
      { headers: this._headers() },
      'failed to fetch project capabilities',
      5000,
    )

    const data = (await res.json()) as {
      capabilities?: { processTemplate?: { templateName?: string } }
    }

    const templateName = data.capabilities?.processTemplate?.templateName ?? ''
    let template: ProcessTemplate

    if (templateName === 'Scrum') {
      template = 'Scrum'
    } else if (templateName === 'CMMI') {
      template = 'CMMI'
    } else {
      template = 'Agile'
    }

    this._processTemplate = template
    return template
  }

  private async _resolveRepository(): Promise<{ id: string; name: string }> {
    if (this._repoCache !== null) return this._repoCache

    const { orgUrl, project, repository } = this._config

    if (repository) {
      const url = `${orgUrl}/${project}/_apis/git/repositories/${encodeURIComponent(repository)}?api-version=7.1`
      const res = await this._request(url, { headers: this._headers() }, `repository '${repository}' not found`)
      const data = (await res.json()) as { id: string; name: string }
      this._repoCache = { id: data.id, name: data.name }
      return this._repoCache
    }

    const url = `${orgUrl}/${project}/_apis/git/repositories?api-version=7.1`
    const res = await this._request(url, { headers: this._headers() }, 'failed to list repositories')
    const data = (await res.json()) as { value?: Array<{ id: string; name: string }> }
    const repos = data.value ?? []
    const repo = repos[0]
    if (!repo) throw new Error('[forja] AzureDevOps: no repositories found in project')

    this._repoCache = repo
    return repo
  }

  private getWorkItemType(template: ProcessTemplate, input: IssueInput): string {
    if (input.labels?.includes('bug')) return 'Bug'

    switch (template) {
      case 'Scrum': return 'Product Backlog Item'
      case 'CMMI': return 'Requirement'
      default: return 'User Story'
    }
  }

  async createIssue(input: IssueInput): Promise<IssueOutput> {
    const template = await this.detectTemplate()
    const workItemType = this.getWorkItemType(template, input)

    const { orgUrl, project } = this._config
    const url = `${orgUrl}/${project}/_apis/wit/workitems/$${encodeURIComponent(workItemType)}?api-version=7.1`

    const body: Array<{ op: string; path: string; value: unknown }> = [
      { op: 'add', path: '/fields/System.Title', value: input.title },
      { op: 'add', path: '/fields/System.Description', value: input.description },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: mapSeverity(input.severity) },
    ]

    if (input.parentId) {
      assertNumericId(input.parentId, 'parentId')
      body.push({
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: `${orgUrl}/_apis/wit/workItems/${input.parentId}`,
        },
      })
    }

    const res = await this._request(
      url,
      {
        method: 'PATCH',
        headers: this._headers('application/json-patch+json'),
        body: JSON.stringify(body),
      },
      'failed to create work item',
    )

    const data = (await res.json()) as {
      id: number
      _links?: { html?: { href?: string }; web?: { href?: string } }
    }

    return {
      id: String(data.id),
      url: data._links?.html?.href ?? data._links?.web?.href ?? '',
      provider: 'azure-devops',
    }
  }

  async updateIssue(id: string, patch: Partial<IssueInput>): Promise<void> {
    assertNumericId(id, 'id')

    const ops: Array<{ op: string; path: string; value: unknown }> = []

    if (patch.title !== undefined) ops.push({ op: 'replace', path: '/fields/System.Title', value: patch.title })
    if (patch.description !== undefined) ops.push({ op: 'replace', path: '/fields/System.Description', value: patch.description })
    if (patch.severity !== undefined) ops.push({ op: 'replace', path: '/fields/Microsoft.VSTS.Common.Priority', value: mapSeverity(patch.severity) })

    if (ops.length === 0) return

    const { orgUrl, project } = this._config
    const url = `${orgUrl}/${project}/_apis/wit/workitems/${id}?api-version=7.1`

    await this._request(
      url,
      {
        method: 'PATCH',
        headers: this._headers('application/json-patch+json'),
        body: JSON.stringify(ops),
      },
      'failed to update work item',
    )
  }

  async closeIssue(id: string): Promise<void> {
    assertNumericId(id, 'id')
    const template = await this.detectTemplate()
    const finalState = template === 'Scrum' ? 'Done' : 'Closed'

    const { orgUrl, project } = this._config
    const url = `${orgUrl}/${project}/_apis/wit/workitems/${id}?api-version=7.1`

    await this._request(
      url,
      {
        method: 'PATCH',
        headers: this._headers('application/json-patch+json'),
        body: JSON.stringify([{ op: 'replace', path: '/fields/System.State', value: finalState }]),
      },
      'failed to close work item',
    )
  }

  async createPR(input: PRInput): Promise<PROutput> {
    const { orgUrl, project } = this._config
    const repo = await this._resolveRepository()

    const url = `${orgUrl}/${project}/_apis/git/repositories/${repo.id}/pullrequests?api-version=7.1`

    const res = await this._request(
      url,
      {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          sourceRefName: `refs/heads/${input.branch}`,
          targetRefName: `refs/heads/${input.base}`,
          title: input.title,
          description: input.body,
        }),
      },
      'failed to create pull request',
    )

    const data = (await res.json()) as { pullRequestId: number }

    return {
      id: String(data.pullRequestId),
      url: `${orgUrl}/_git/${encodeURIComponent(repo.name)}/pullrequest/${data.pullRequestId}`,
      provider: 'azure-devops',
    }
  }

  async addComment(issueId: string, body: string): Promise<void> {
    const { orgUrl, project } = this._config
    const url = `${orgUrl}/${project}/_apis/wit/workItems/${issueId}/comments?api-version=7.1-preview.3`

    await this._request(
      url,
      {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ text: body }),
      },
      'failed to add comment',
    )
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const { orgUrl } = this._config
    const url = `${orgUrl}/_apis/projects?api-version=7.1`
    const start = Date.now()

    let res: Response
    try {
      res = await fetch(url, {
        headers: { Authorization: this._authHeader },
        signal: AbortSignal.timeout(3000),
      })
    } catch {
      return { ok: false, latencyMs: Date.now() - start }
    }

    const latencyMs = Date.now() - start

    if (res.status === 401) {
      throw new Error('[forja] AzureDevOps: unauthorized — PAT requires scopes: vso.work_write, vso.code_write')
    }

    return { ok: res.ok, latencyMs }
  }
}

export function createAzureDevOpsProvider(config: AzureDevOpsConfig): AzureDevOpsProvider {
  return new AzureDevOpsProvider(config)
}

registerProviderFactory((config) => {
  if (!config.azure) return null
  return new AzureDevOpsProvider(config.azure)
})
