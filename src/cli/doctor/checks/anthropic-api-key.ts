import { registerCheck } from '../check.js'

registerCheck({
  name: 'anthropic-api-key',
  async run() {
    if (process.env.ANTHROPIC_API_KEY) {
      return { status: 'pass', message: 'ANTHROPIC_API_KEY is set' }
    }
    return {
      status: 'warn',
      message: 'ANTHROPIC_API_KEY is not set',
      remediation: 'Set the ANTHROPIC_API_KEY environment variable',
    }
  },
})
