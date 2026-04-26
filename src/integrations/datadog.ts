import type { DatadogConfig } from '../schemas/config.js'

export type { DatadogConfig }

export interface MetricPoint {
  name: string
  type: 'gauge' | 'count'
  value: number
  tags: string[]
  timestamp?: number
}

export interface DatadogEvent {
  title: string
  text: string
  tags: string[]
}

export interface DatadogLog {
  message: string
  run_id: string
  project: string
  phase: string
  gate?: string
  cost_usd?: number
}

const METRIC_TYPE = { gauge: 3, count: 1 } as const
const BATCH_WINDOW_MS = 10_000
const MAX_LOGS_PER_REQUEST = 1_000

export class DatadogProvider {
  readonly name = 'datadog'
  private readonly _config: DatadogConfig
  private readonly _headers: Record<string, string>
  private _batch: MetricPoint[] = []
  private _timer: ReturnType<typeof setTimeout> | null = null

  constructor(config: DatadogConfig) {
    this._config = config
    this._headers = {
      'Content-Type': 'application/json',
      'DD-API-KEY': config.apiKey,
    }
  }

  private get _apiBase(): string {
    return `https://api.${this._config.site}`
  }

  private get _logsBase(): string {
    return `https://http-intake.logs.${this._config.site}`
  }

  private async _post(url: string, body: unknown, timeoutMs = 10_000): Promise<void> {
    const res = await fetch(url, {
      method: 'POST',
      headers: this._headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      console.warn(`[forja] Datadog POST failed: ${res.status} ${url}`)
    }
  }

  queueMetric(metric: MetricPoint): void {
    this._batch.push(metric)
    if (this._timer === null) {
      this._timer = setTimeout(() => { void this.flush() }, BATCH_WINDOW_MS)
    }
  }

  async flush(): Promise<void> {
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    const toSend = this._batch.splice(0)
    if (toSend.length === 0) return
    const series = toSend.map(m => ({
      metric: m.name,
      type: METRIC_TYPE[m.type],
      points: [{ timestamp: m.timestamp ?? Math.floor(Date.now() / 1000), value: m.value }],
      tags: m.tags,
    }))
    await this._post(`${this._apiBase}/api/v2/series`, { series })
  }

  close(): void {
    if (this._batch.length > 0) {
      console.warn(`[forja] DatadogProvider.close() discarding ${this._batch.length} unflushed metrics — call flush() first`)
    }
    if (this._timer !== null) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this._batch.splice(0)
  }

  async sendEvent(event: DatadogEvent): Promise<void> {
    await this._post(`${this._apiBase}/api/v1/events`, {
      title: event.title,
      text: event.text,
      tags: event.tags,
    })
  }

  async sendLogs(logs: DatadogLog[]): Promise<void> {
    for (let i = 0; i < logs.length; i += MAX_LOGS_PER_REQUEST) {
      const chunk = logs.slice(i, i + MAX_LOGS_PER_REQUEST)
      const payload = chunk.map(l => ({
        message: l.message,
        ddsource: 'forja',
        ddtags: [
          `run_id:${l.run_id}`,
          `project:${l.project}`,
          `phase:${l.phase}`,
          ...(l.gate !== undefined ? [`gate:${l.gate}`] : []),
        ].join(','),
        run_id: l.run_id,
        project: l.project,
        phase: l.phase,
        ...(l.gate !== undefined ? { gate: l.gate } : {}),
        ...(l.cost_usd !== undefined ? { cost_usd: l.cost_usd } : {}),
      }))
      await this._post(`${this._logsBase}/api/v2/logs`, payload)
    }
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now()
    try {
      const res = await fetch(`${this._apiBase}/api/v1/validate`, {
        headers: { 'DD-API-KEY': this._config.apiKey },
        signal: AbortSignal.timeout(3_000),
      })
      return { ok: res.ok, latencyMs: Date.now() - start }
    } catch {
      return { ok: false, latencyMs: Date.now() - start }
    }
  }
}

export function createDatadogProvider(config: DatadogConfig): DatadogProvider {
  return new DatadogProvider(config)
}
