import { registerCheck, withTimeout } from '../check.js'
import { loadConfig, redactDsn } from '../../../config/loader.js'
import { getPendingMigrationCount } from '../../../store/drizzle/migrations.js'

registerCheck({
  name: 'db-migrations',
  async run() {
    const config = await loadConfig()
    const { storeUrl } = config
    try {
      const count = await withTimeout(getPendingMigrationCount(storeUrl), 3000)
      if (count === 0) {
        return { status: 'pass', message: 'No pending migrations' }
      }
      return {
        status: 'warn',
        message: `${count} pending migration(s)`,
        remediation: 'Run `forja migrate postgres` to apply pending migrations',
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      return {
        status: 'fail',
        message: `Could not check migrations: ${redactDsn(detail)}`,
        remediation: 'Ensure the database is reachable first',
      }
    }
  },
})
