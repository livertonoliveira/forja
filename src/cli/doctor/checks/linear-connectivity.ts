import { registerCheck, withTimeout } from '../check.js'

registerCheck({
  name: 'linear-connectivity',
  async run() {
    const apiKey = process.env.LINEAR_API_KEY ?? process.env.LINEAR_TOKEN
    if (!apiKey) {
      return { status: 'pass', message: 'not configured (skipped)' }
    }
    try {
      const response = await withTimeout(
        fetch('https://api.linear.app/graphql', { method: 'GET' }),
        3000,
      )
      if (response.status === 200 || response.status === 405) {
        return { status: 'pass', message: 'api.linear.app is reachable' }
      }
      return {
        status: 'fail',
        message: `api.linear.app returned HTTP ${response.status}`,
        remediation:
          'Check network connectivity to api.linear.app or verify LINEAR_API_KEY is valid',
      }
    } catch {
      return {
        status: 'fail',
        message: 'Could not reach api.linear.app',
        remediation:
          'Check network connectivity to api.linear.app or verify LINEAR_API_KEY is valid',
      }
    }
  },
})
