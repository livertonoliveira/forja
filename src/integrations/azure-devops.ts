import type { AzureDevOpsConfig } from '../schemas/config.js'
import type { IntegrationProvider, IssueInput, IssueOutput, PRInput, PROutput } from './base.js'
import { registerProviderFactory } from './factory.js'

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

const AZURE_DOMAIN_RE = /\.(azure\.com|visualstudio\.com)$/

export class AzureDevOpsProvider implements IntegrationProvider {
  readonly name = 'azure-devops'

  private readonly _config: AzureDevOpsConfig
  private readonly _authHeader: string
  private _processTemplate: ProcessTemplate | null = null

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

  private async detectTemplate(): Promise<ProcessTemplate> {
    if (this._processTemplate !== null) return this._processTemplate

    const { orgUrl, project } = this._config
    const url = `${orgUrl}/_apis/projects/${encodeURIComponent(project)}?includeCapabilities=true&api-version=7.1`

    const res = await fetch(url, {
      headers: this._headers(),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      throw new Error(`[forja] AzureDevOps: failed to fetch project capabilities (${res.status})`)
    }

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

    const body = [
      { op: 'add', path: '/fields/System.Title', value: input.title },
      { op: 'add', path: '/fields/System.Description', value: input.description },
      { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: mapSeverity(input.severity) },
    ]

    const res = await fetch(url, {
      method: 'PATCH',
      headers: this._headers('application/json-patch+json'),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`[forja] AzureDevOps: failed to create work item (${res.status})`)
    }

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

  async updateIssue(_id: string, _patch: Partial<IssueInput>): Promise<void> {
    throw new NotImplementedError('updateIssue')
  }

  async closeIssue(_id: string): Promise<void> {
    throw new NotImplementedError('closeIssue')
  }

  async createPR(_input: PRInput): Promise<PROutput> {
    throw new NotImplementedError('createPR')
  }

  async addComment(issueId: string, body: string): Promise<void> {
    const { orgUrl, project } = this._config
    const url = `${orgUrl}/${project}/_apis/wit/workItems/${issueId}/comments?api-version=7.1-preview.3`

    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ text: body }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      throw new Error(`[forja] AzureDevOps: failed to add comment (${res.status})`)
    }
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
