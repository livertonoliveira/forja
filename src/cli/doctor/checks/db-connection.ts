import { registerCheck, withTimeout } from '../check.js'
import { loadConfig, redactDsn } from '../../../config/loader.js'
import { createStore } from '../../../store/index.js'

registerCheck({
  name: 'db-connection',
  async run() {
    const config = await loadConfig()
    const { storeUrl } = config
    const store = createStore(storeUrl)
    try {
      await withTimeout(store.ping(), 3000)
      return { status: 'pass', message: `Connected to ${redactDsn(storeUrl)}` }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'timeout'
      return {
        status: 'fail',
        message: `${isTimeout ? 'Connection timed out' : 'Could not connect to'} ${redactDsn(storeUrl)}`,
        remediation:
          'Run `forja infra up` to start a local database, or set FORJA_STORE_URL to a valid connection string',
      }
    } finally {
      await store.close()
    }
  },
})
