import { NodeSDK } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import type { OTelConfig } from '../schemas/config.js'

export type { OTelConfig }

let _sdk: NodeSDK | null = null
let _sigTermRegistered = false

export function readOTelConfig(): OTelConfig {
  const endpoint = process.env.FORJA_OTEL_ENDPOINT ?? 'http://localhost:4317'
  try {
    const scheme = new URL(endpoint).protocol
    if (scheme !== 'http:' && scheme !== 'https:' && scheme !== 'grpc:') {
      process.stderr.write(`[forja] OTel endpoint scheme "${scheme}" is unexpected — expected http/https/grpc\n`)
    }
  } catch {
    process.stderr.write(`[forja] OTel endpoint "${endpoint}" is not a valid URL — OTel disabled\n`)
    return { enabled: false, endpoint, protocol: 'grpc' }
  }
  return {
    enabled: process.env.FORJA_OTEL_ENABLED === 'true',
    endpoint,
    protocol: (process.env.FORJA_OTEL_PROTOCOL as 'grpc' | 'http') ?? 'grpc',
  }
}

export function initOTel(config: OTelConfig): void {
  if (!config.enabled) return

  const traceExporter =
    config.protocol === 'grpc'
      ? new OTLPTraceExporter({ url: config.endpoint })
      : new OTLPTraceExporterHttp({ url: config.endpoint })

  _sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': 'forja',
      'service.version': process.env.npm_package_version ?? 'unknown',
    }),
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  })

  _sdk.start()

  if (!_sigTermRegistered) {
    _sigTermRegistered = true
    process.on('SIGTERM', () => {
      void shutdownOTel()
    })
  }
}

export async function shutdownOTel(): Promise<void> {
  if (_sdk) {
    try {
      await _sdk.shutdown()
    } catch (err) {
      process.stderr.write(
        `[forja] OTel flush error: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    } finally {
      _sdk = null
    }
  }
}
