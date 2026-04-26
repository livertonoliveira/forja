import { tracer } from '../otel/tracer.js'

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerConfig {
  failureThreshold: number
  windowMs: number
  cooldownMs: number
  successThreshold: number
}

const defaultConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 60_000,
  successThreshold: 2,
}

export class CircuitOpenError extends Error {
  constructor(endpoint: string) {
    super(`circuit open: ${endpoint}`)
    this.name = 'CircuitOpenError'
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures: number[] = []
  private consecutiveSuccesses = 0
  private openedAt = 0

  constructor(
    public readonly name: string,
    private readonly config: CircuitBreakerConfig = defaultConfig,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt > this.config.cooldownMs) {
        this.transition('half-open')
      } else {
        throw new CircuitOpenError(this.name)
      }
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (err) {
      this.recordFailure()
      throw err
    }
  }

  getStatus(): { endpoint: string; state: CircuitState; failures: number } {
    const now = Date.now()
    this.failures = this.failures.filter(t => now - t <= this.config.windowMs)
    return { endpoint: this.name, state: this.state, failures: this.failures.length }
  }

  private transition(newState: CircuitState): void {
    this.state = newState
    tracer.startActiveSpan('forja.circuit.transition', span => {
      span.setAttribute('forja.circuit.endpoint', this.name)
      span.setAttribute('forja.circuit.state', newState)
      span.end()
    })
  }

  private recordSuccess(): void {
    if (this.state === 'half-open') {
      this.consecutiveSuccesses++
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.consecutiveSuccesses = 0
        this.failures = []
        this.transition('closed')
      }
    }
  }

  private recordFailure(): void {
    const now = Date.now()
    this.failures.push(now)
    this.failures = this.failures.filter(t => now - t <= this.config.windowMs)

    if (this.state === 'half-open') {
      this.consecutiveSuccesses = 0
      this.openedAt = now
      this.transition('open')
      return
    }

    if (this.state === 'closed' && this.failures.length >= this.config.failureThreshold) {
      this.openedAt = now
      this.transition('open')
    }
  }
}

const registry = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(endpoint: string, config?: CircuitBreakerConfig): CircuitBreaker {
  if (!registry.has(endpoint)) {
    registry.set(endpoint, new CircuitBreaker(endpoint, config))
  }
  return registry.get(endpoint)!
}

export function listCircuitBreakers(): Array<{ endpoint: string; state: CircuitState; failures: number }> {
  return Array.from(registry.values()).map(cb => cb.getStatus())
}

export function resetCircuitBreakers(): void {
  registry.clear()
}
