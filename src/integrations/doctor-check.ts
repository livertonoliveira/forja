import { registerCheck, withTimeout } from '../cli/doctor/check.js'
import { getIntegrationProvider } from './factory.js'

registerCheck({
  name: 'integration-provider',
  async run() {
    const config = buildIntegrationConfigFromEnv()
    const provider = await getIntegrationProvider(config)
    if (!provider) {
      return { status: 'pass', message: 'No integration provider configured (optional)' }
    }
    const providerName = provider.name
    const remediation = `Check your ${providerName} credentials in forja/config.md`
    try {
      const result = await withTimeout(provider.healthCheck(), 5_000)
      return result.ok
        ? { status: 'pass', message: `${providerName} integration is healthy (${result.latencyMs}ms)` }
        : {
            status: 'warn',
            message: `${providerName} integration health check failed`,
            remediation,
          }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const safe = raw.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 200)
      return {
        status: 'fail',
        message: `${providerName} health check threw: ${safe}`,
        remediation,
      }
    }
  },
})

function safeHttpsUrl(value: string | undefined): string {
  if (!value) return ''
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:') return ''
    return value
  } catch {
    return ''
  }
}

function buildIntegrationConfigFromEnv() {
  return {
    jira: process.env.JIRA_TOKEN
      ? {
          baseUrl: safeHttpsUrl(process.env.JIRA_BASE_URL),
          email: process.env.JIRA_EMAIL ?? '',
          token: process.env.JIRA_TOKEN,
          projectKey: process.env.JIRA_PROJECT_KEY ?? '',
        }
      : undefined,
    gitlab: process.env.GITLAB_TOKEN
      ? {
          baseUrl: safeHttpsUrl(process.env.GITLAB_BASE_URL) || 'https://gitlab.com',
          token: process.env.GITLAB_TOKEN,
        }
      : undefined,
    azure: process.env.AZURE_DEVOPS_TOKEN
      ? {
          orgUrl: safeHttpsUrl(process.env.AZURE_DEVOPS_ORG_URL),
          project: process.env.AZURE_DEVOPS_PROJECT ?? '',
          token: process.env.AZURE_DEVOPS_TOKEN,
        }
      : undefined,
    bitbucket: process.env.BITBUCKET_APP_PASSWORD
      ? {
          workspace: process.env.BITBUCKET_WORKSPACE ?? '',
          repoSlug: process.env.BITBUCKET_REPO_SLUG ?? '',
          username: process.env.BITBUCKET_USERNAME ?? '',
          appPassword: process.env.BITBUCKET_APP_PASSWORD,
        }
      : undefined,
  }
}
