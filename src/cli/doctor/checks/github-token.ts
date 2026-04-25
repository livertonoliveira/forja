import { registerCheck } from '../check.js'
import { loadConfig } from '../../../config/loader.js'

registerCheck({
  name: 'github-token',
  async run() {
    const config = await loadConfig()
    if (process.env.GITHUB_TOKEN ?? config.githubToken) {
      return { status: 'pass', message: 'GITHUB_TOKEN is set' }
    }
    return {
      status: 'warn',
      message: 'GITHUB_TOKEN is not set',
      remediation:
        'Set the GITHUB_TOKEN environment variable or run `forja config set github_token <token>`',
    }
  },
})
