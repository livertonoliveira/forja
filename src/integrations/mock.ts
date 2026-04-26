import type { IntegrationProvider, IssueInput, IssueOutput, PRInput, PROutput } from './base.js'

interface CallRecord {
  method: string
  args: unknown[]
}

export class MockIntegrationProvider implements IntegrationProvider {
  readonly name = 'mock'
  private _calls: CallRecord[] = []

  getCalls(): CallRecord[] {
    return [...this._calls]
  }

  async createIssue(input: IssueInput): Promise<IssueOutput> {
    this._calls.push({ method: 'createIssue', args: [input] })
    return { id: 'mock-issue-1', url: 'https://mock.example/issue/1', provider: this.name }
  }

  async updateIssue(id: string, patch: Partial<IssueInput>): Promise<void> {
    this._calls.push({ method: 'updateIssue', args: [id, patch] })
  }

  async closeIssue(id: string): Promise<void> {
    this._calls.push({ method: 'closeIssue', args: [id] })
  }

  async createPR(input: PRInput): Promise<PROutput> {
    this._calls.push({ method: 'createPR', args: [input] })
    return { id: 'mock-pr-1', url: 'https://mock.example/pr/1', provider: this.name }
  }

  async addComment(issueId: string, body: string): Promise<void> {
    this._calls.push({ method: 'addComment', args: [issueId, body] })
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    this._calls.push({ method: 'healthCheck', args: [] })
    return { ok: true, latencyMs: 0 }
  }
}
