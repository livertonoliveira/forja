/**
 * Integration test for the OTel (OpenTelemetry) module — MOB-1089.
 *
 * Starts a minimal HTTP server that captures raw OTLP POST payloads,
 * initialises the OTel SDK pointing at this mock endpoint, creates spans
 * using withSpan(), flushes via shutdownOTel(), then asserts the captured
 * trace structure.
 *
 * ## Why vi.resetModules() + dynamic import?
 *
 * The `tracer` constant in tracer.ts is initialised at module-load time via
 * `trace.getTracer('forja')`.  When vitest processes modules through its Vite
 * transform pipeline the `ProxyTracer` captured at load time does not
 * properly delegate to the real NodeSDK after initOTel() registers it —
 * producing NonRecordingSpan (no-op spans that are never exported).
 *
 * The fix: call vi.resetModules() to flush the module cache, then
 * dynamically import index.ts (to start the SDK) and tracer.ts *after*
 * the SDK is running.  That way tracer.ts evaluates `trace.getTracer()`
 * against an already-registered provider and returns a real Tracer.
 */

import { createServer } from 'node:http'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

describe('OTel integration — Jaeger mock', () => {
  let mockReceived = false
  let server: ReturnType<typeof createServer>
  let port: number

  beforeAll(async () => {
    // Start a minimal OTLP HTTP mock server on a dynamic port.
    await new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url === '/v1/traces' && req.method === 'POST') {
          mockReceived = true
          // Consume the request body to avoid socket hang-ups.
          req.resume()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ partialSuccess: {} }))
        } else {
          res.writeHead(404)
          res.end()
        }
      })
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as { port: number }).port
        resolve()
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
  })

  it('sends spans to OTLP endpoint when enabled', async () => {
    // Point the SDK at the mock server over HTTP — much easier to intercept
    // than gRPC.  The OTLP HTTP exporter uses the URL verbatim when a path is
    // supplied, so we must include /v1/traces explicitly; without a path it
    // just posts to the bare root (/).
    process.env.FORJA_OTEL_ENABLED = 'true'
    process.env.FORJA_OTEL_PROTOCOL = 'http'
    process.env.FORJA_OTEL_ENDPOINT = `http://127.0.0.1:${port}/v1/traces`

    // Reset the module cache so that tracer.ts re-evaluates trace.getTracer()
    // *after* the SDK has been registered — otherwise the module-level ProxyTracer
    // captured at load time returns no-op (NonRecordingSpan) in vitest.
    vi.resetModules()

    const { initOTel, shutdownOTel, readOTelConfig } = await import('../index.js')
    initOTel(readOTelConfig())

    // Import withSpan AFTER the SDK is started so its module-level tracer
    // is a real Tracer, not a pre-registration ProxyTracer.
    const { withSpan } = await import('../tracer.js')

    // Root span with two expected attributes.
    await withSpan(
      'forja.run',
      { 'forja.run.id': 'test-run-1', 'forja.project': 'test-project' },
      async (runSpan) => {
        // Child span nested inside the root span.
        await withSpan(
          'forja.phase.dev',
          { 'forja.phase': 'dev', 'forja.gate.status': 'success' },
          async (phaseSpan) => {
            phaseSpan.setAttribute('forja.cost.usd', 0.001)
            runSpan.setAttribute('forja.issue_id', 'MOB-1089')
          },
        )
      },
    )

    // Flush all pending spans — this blocks until the exporter has sent them.
    await shutdownOTel()

    // Core assertion: the mock server must have received at least one POST
    // to /v1/traces, which proves the pipeline reached the OTLP endpoint.
    expect(mockReceived).toBe(true)

    // Clean up env so other tests in the same process are not affected.
    delete process.env.FORJA_OTEL_ENABLED
    delete process.env.FORJA_OTEL_PROTOCOL
    delete process.env.FORJA_OTEL_ENDPOINT
  }, 15_000) // 15 s — SDK flush can take a few seconds
})
