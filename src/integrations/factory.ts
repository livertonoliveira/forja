import type { JiraConfig, GitLabConfig, AzureDevOpsConfig, BitbucketConfig } from '../schemas/config.js'
import type { IntegrationProvider } from './base.js'

export interface IntegrationConfig {
  jira?: JiraConfig
  gitlab?: GitLabConfig
  azure?: AzureDevOpsConfig
  bitbucket?: BitbucketConfig
}

export type ProviderFactory = (config: IntegrationConfig) => IntegrationProvider | null

const _factories: ProviderFactory[] = []

export function registerProviderFactory(factory: ProviderFactory): void {
  _factories.push(factory)
}

/** @internal test-only — resets the provider factory registry */
export function resetProviderFactories(): void {
  _factories.splice(0, _factories.length)
}

export async function getIntegrationProvider(config: IntegrationConfig): Promise<IntegrationProvider | null> {
  for (const factory of _factories) {
    const provider = factory(config)
    if (provider !== null) return provider
  }
  return null
}
