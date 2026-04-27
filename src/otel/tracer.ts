import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api'

export const tracer = trace.getTracer('forja')

export function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes: attrs }, (span) => {
    return fn(span)
      .then((result) => {
        span.setStatus({ code: SpanStatusCode.OK })
        span.end()
        return result
      })
      .catch((err) => {
        span.recordException(err instanceof Error ? err : new Error(String(err)))
        span.setStatus({ code: SpanStatusCode.ERROR })
        span.end()
        throw err
      })
  })
}
