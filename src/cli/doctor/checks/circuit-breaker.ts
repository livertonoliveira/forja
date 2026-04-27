import { registerCheck } from '../check.js'
import { listCircuitBreakers } from '../../../hooks/circuit-breaker.js'

registerCheck({
  name: 'circuit-breakers',
  async run() {
    const breakers = listCircuitBreakers()

    if (breakers.length === 0) {
      return { status: 'pass', message: 'No circuit breakers active' }
    }

    const open = breakers.filter(b => b.state === 'open')
    const halfOpen = breakers.filter(b => b.state === 'half-open')

    if (open.length > 0) {
      return {
        status: 'warn',
        message: `${open.length} circuit(s) open: ${open.map(b => b.endpoint).join(', ')}`,
        remediation: 'Check integration endpoints for errors or wait for cooldown to expire',
      }
    }

    if (halfOpen.length > 0) {
      return {
        status: 'warn',
        message: `${halfOpen.length} circuit(s) in half-open: ${halfOpen.map(b => b.endpoint).join(', ')}`,
        remediation: 'Endpoints are recovering — monitor for consecutive successes',
      }
    }

    return {
      status: 'pass',
      message: `All ${breakers.length} circuit(s) closed`,
    }
  },
})
