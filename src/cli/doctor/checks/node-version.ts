import { registerCheck } from '../check.js'

registerCheck({
  name: 'node-version',
  async run() {
    const match = process.version.match(/^v(\d+)/)
    const major = match ? parseInt(match[1], 10) : 0
    if (major >= 20) {
      return { status: 'pass', message: `Node.js ${process.version}` }
    }
    return {
      status: 'fail',
      message: `Node.js ${process.version} is below the required v20`,
      remediation: 'Upgrade Node.js to v20 or later: https://nodejs.org',
    }
  },
})
