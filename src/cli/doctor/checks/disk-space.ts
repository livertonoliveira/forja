import fs from 'node:fs/promises'
import { registerCheck, withTimeout } from '../check.js'

const WARN_THRESHOLD = 500 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

registerCheck({
  name: 'disk-space',
  async run() {
    try {
      const stats = await withTimeout(fs.statfs(process.cwd()), 3000)
      const available = stats.bavail * stats.bsize
      if (available >= WARN_THRESHOLD) {
        return { status: 'pass', message: `${formatBytes(available)} available` }
      }
      return {
        status: 'warn',
        message: `Only ${formatBytes(available)} available`,
        remediation: 'Free up disk space to avoid pipeline failures',
      }
    } catch {
      return { status: 'warn', message: 'could not check disk space' }
    }
  },
})
