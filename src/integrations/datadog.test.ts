import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DatadogProvider, createDatadogProvider } from './datadog.js'
import type { DatadogConfig } from './datadog.js'

const BASE_CONFIG: DatadogConfig = {
  apiKey: 'test-api-key',
  appKey: 'test-app-key',
  site: 'datadoghq.com',
}

const EU_CONFIG: DatadogConfig = {
  apiKey: 'eu-api-key',
  appKey: 'eu-app-key',
  site: 'datadoghq.eu',
}

function makeFetchSpy(status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({}), { status })
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('DatadogProvider — metric batching', () => {
  it('sends all queued metrics in a single fetch call', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    provider.queueMetric({ name: 'forja.run.duration', type: 'gauge', value: 42, tags: ['phase:dev'] })
    provider.queueMetric({ name: 'forja.run.cost', type: 'count', value: 1, tags: ['phase:dev'] })

    await provider.flush()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.datadoghq.com/api/v2/series')
    const body = JSON.parse(init.body as string) as { series: unknown[] }
    expect(body.series).toHaveLength(2)
  })

  it('does not call fetch when flush is called with empty batch', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    await provider.flush()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('clears the batch after flush so a second flush sends nothing', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    provider.queueMetric({ name: 'forja.run.duration', type: 'gauge', value: 10, tags: [] })
    await provider.flush()
    await provider.flush()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('DatadogProvider — auto-flush after 10s window', () => {
  it('automatically flushes after BATCH_WINDOW_MS elapses', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    provider.queueMetric({ name: 'forja.run.duration', type: 'gauge', value: 5, tags: [] })

    expect(fetchSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10_000)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not schedule a second timer if one is already pending', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    provider.queueMetric({ name: 'metric.a', type: 'gauge', value: 1, tags: [] })
    provider.queueMetric({ name: 'metric.b', type: 'count', value: 2, tags: [] })

    await vi.advanceTimersByTimeAsync(10_000)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as { series: unknown[] }
    expect(body.series).toHaveLength(2)
  })
})

describe('DatadogProvider — sendEvent', () => {
  it('posts event with gate:fail tags to the v1/events endpoint', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    await provider.sendEvent({
      title: 'Forja gate failed',
      text: 'Security phase gate: fail',
      tags: ['gate:fail', 'phase:security', 'project:spokane'],
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.datadoghq.com/api/v1/events')
    const body = JSON.parse(init.body as string) as { title: string; tags: string[] }
    expect(body.title).toBe('Forja gate failed')
    expect(body.tags).toContain('gate:fail')
  })

  it('warns on non-ok response without throwing', async () => {
    makeFetchSpy(403)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const provider = new DatadogProvider(BASE_CONFIG)

    await expect(provider.sendEvent({ title: 'x', text: 'y', tags: [] })).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('403'))
  })
})

describe('DatadogProvider — sendLogs', () => {
  it('posts logs with run_id, project, phase attributes', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    await provider.sendLogs([
      { message: 'Phase dev complete', run_id: 'run-123', project: 'spokane', phase: 'dev', gate: 'pass', cost_usd: 0.05 },
    ])

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://http-intake.logs.datadoghq.com/api/v2/logs')
    const payload = JSON.parse(init.body as string) as Array<{
      run_id: string
      project: string
      phase: string
      gate: string
      cost_usd: number
      ddsource: string
      ddtags: string
    }>
    expect(payload).toHaveLength(1)
    expect(payload[0].run_id).toBe('run-123')
    expect(payload[0].project).toBe('spokane')
    expect(payload[0].phase).toBe('dev')
    expect(payload[0].gate).toBe('pass')
    expect(payload[0].cost_usd).toBe(0.05)
    expect(payload[0].ddsource).toBe('forja')
    expect(payload[0].ddtags).toContain('gate:pass')
  })

  it('omits gate and cost_usd when not provided', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)

    await provider.sendLogs([
      { message: 'Log entry', run_id: 'run-456', project: 'proj', phase: 'test' },
    ])

    const payload = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string) as Array<Record<string, unknown>>
    expect(payload[0]).not.toHaveProperty('gate')
    expect(payload[0]).not.toHaveProperty('cost_usd')
  })
})

describe('DatadogProvider — healthCheck', () => {
  it('returns ok:true and latencyMs when validate returns 200', async () => {
    makeFetchSpy(200)
    const provider = new DatadogProvider(BASE_CONFIG)

    const result = await provider.healthCheck()

    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('returns ok:false when validate returns 403', async () => {
    makeFetchSpy(403)
    const provider = new DatadogProvider(BASE_CONFIG)

    const result = await provider.healthCheck()

    expect(result.ok).toBe(false)
  })

  it('returns ok:false when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))
    const provider = new DatadogProvider(BASE_CONFIG)

    const result = await provider.healthCheck()

    expect(result.ok).toBe(false)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })
})

describe('DatadogProvider — EU site URL support', () => {
  it('uses datadoghq.eu base URL for metrics', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(EU_CONFIG)

    provider.queueMetric({ name: 'forja.run.duration', type: 'gauge', value: 1, tags: [] })
    await provider.flush()

    const [url] = fetchSpy.mock.calls[0] as [string]
    expect(url).toBe('https://api.datadoghq.eu/api/v2/series')
  })

  it('uses datadoghq.eu base URL for logs', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(EU_CONFIG)

    await provider.sendLogs([{ message: 'eu log', run_id: 'r1', project: 'p', phase: 'dev' }])

    const [url] = fetchSpy.mock.calls[0] as [string]
    expect(url).toBe('https://http-intake.logs.datadoghq.eu/api/v2/logs')
  })

  it('uses datadoghq.eu base URL for events', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(EU_CONFIG)

    await provider.sendEvent({ title: 't', text: 'x', tags: [] })

    const [url] = fetchSpy.mock.calls[0] as [string]
    expect(url).toBe('https://api.datadoghq.eu/api/v1/events')
  })
})

describe('DatadogProvider — sendLogs chunking', () => {
  it('sends logs in chunks of 1000 when array exceeds limit', async () => {
    const fetchSpy = makeFetchSpy()
    const provider = new DatadogProvider(BASE_CONFIG)
    const logs = Array.from({ length: 1500 }, (_, i) => ({
      message: `log ${i}`,
      run_id: 'r1',
      project: 'p',
      phase: 'test',
    }))

    await provider.sendLogs(logs)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('DatadogProvider — close() with unflushed metrics', () => {
  it('warns when closing with pending metrics', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const provider = new DatadogProvider(BASE_CONFIG)
    provider.queueMetric({ name: 'forja.run.duration', type: 'gauge', value: 1, tags: [] })

    provider.close()

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('unflushed metrics'))
  })
})

describe('createDatadogProvider — factory function', () => {
  it('returns a DatadogProvider instance', () => {
    const provider = createDatadogProvider(BASE_CONFIG)
    expect(provider).toBeInstanceOf(DatadogProvider)
    expect(provider.name).toBe('datadog')
  })
})
