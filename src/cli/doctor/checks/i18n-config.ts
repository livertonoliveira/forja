import fs from 'node:fs/promises'
import path from 'node:path'
import { SUPPORTED_ARTIFACT_LANGUAGES } from '../../../schemas/config.js'
import { registerCheck } from '../check.js'

const ARTIFACT_LANGUAGE_PATTERN = /artifact[_ ]language\s*:\s*(.+)/i

registerCheck({
  name: 'i18n-config',
  async run() {
    const configPath = path.resolve(process.cwd(), 'forja/config.md')
    let content: string
    try {
      content = await fs.readFile(configPath, 'utf-8')
    } catch {
      return {
        status: 'pass',
        message: 'forja/config.md not found — skipping i18n check',
      }
    }
    const match = ARTIFACT_LANGUAGE_PATTERN.exec(content)
    if (!match) {
      return {
        status: 'warn',
        message: 'artifact_language absent from forja/config.md',
        remediation: 'Run `forja config migrate` to add missing fields',
      }
    }
    const rawValue = match[1].trim().split(/[\s(]/)[0]
    if (!SUPPORTED_ARTIFACT_LANGUAGES.includes(rawValue as (typeof SUPPORTED_ARTIFACT_LANGUAGES)[number])) {
      return {
        status: 'fail',
        message: `artifact_language "${rawValue}" is not a supported language`,
        remediation: `Supported values: ${SUPPORTED_ARTIFACT_LANGUAGES.join(', ')}`,
      }
    }
    return { status: 'pass', message: `artifact_language is valid (${rawValue})` }
  },
})
