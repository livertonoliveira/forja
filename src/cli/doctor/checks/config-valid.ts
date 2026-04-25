import fs from 'node:fs/promises'
import path from 'node:path'
import { registerCheck } from '../check.js'

const REQUIRED_SECTIONS = ['## Project', '## Stack', '## Linear Integration']

registerCheck({
  name: 'config-valid',
  async run() {
    const configPath = path.resolve(process.cwd(), 'forja/config.md')
    let content: string
    try {
      content = await fs.readFile(configPath, 'utf-8')
    } catch {
      return {
        status: 'fail',
        message: 'forja/config.md not found',
        remediation: 'Run `forja init` to create forja/config.md',
      }
    }
    const missing = REQUIRED_SECTIONS.filter((s) => !content.includes(s))
    if (missing.length > 0) {
      return {
        status: 'warn',
        message: `forja/config.md is missing sections: ${missing.join(', ')}`,
        remediation: 'Run `forja init` to regenerate forja/config.md',
      }
    }
    return { status: 'pass', message: 'forja/config.md is valid' }
  },
})
