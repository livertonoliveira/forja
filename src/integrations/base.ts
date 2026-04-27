export interface IssueInput {
  title: string
  description: string
  severity: string
  labels?: string[]
  parentId?: string
}

export interface ResourceOutput {
  id: string
  url: string
  provider: string
}

export type IssueOutput = ResourceOutput

export interface PRInput {
  title: string
  body: string
  branch: string
  base: string
}

export type PROutput = ResourceOutput

export interface IntegrationProvider {
  readonly name: string
  createIssue(input: IssueInput): Promise<IssueOutput>
  updateIssue(id: string, patch: Partial<IssueInput>): Promise<void>
  closeIssue(id: string): Promise<void>
  createPR(input: PRInput): Promise<PROutput>
  addComment(issueId: string, body: string): Promise<void>
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>
}
