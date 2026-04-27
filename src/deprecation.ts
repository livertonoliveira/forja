import { z } from 'zod';
import { TraceWriter } from './trace/writer.js';

const _warned = new Set<string>();

export function resetDeprecationState(): void {
  _warned.clear();
}

function _writeDeprecationTrace(opts: {
  name: string;
  since: string;
  removeIn: string;
  replacement?: string;
}): void {
  const runId = process.env.FORJA_RUN_ID;
  if (!runId) return;
  if (!z.string().uuid().safeParse(runId).success) return;

  new TraceWriter(runId)
    .write({
      eventType: 'deprecation_warning',
      runId,
      payload: {
        name: opts.name,
        since: opts.since,
        removeIn: opts.removeIn,
        replacement: opts.replacement ?? null,
        severity: 'low',
      },
    })
    .catch(() => {});
}

export function warnDeprecated(opts: {
  name: string;
  since: string;
  removeIn: string;
  replacement?: string;
  url?: string;
}): void {
  if (process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS === '1') return;
  if (_warned.has(opts.name)) return;
  _warned.add(opts.name);

  const parts = [`${opts.name} is deprecated since ${opts.since} and will be removed in ${opts.removeIn}.`];
  if (opts.replacement) parts.push(`Use ${opts.replacement} instead.`);
  if (opts.url) parts.push(opts.url);

  process.emitWarning(parts.join(' '), { type: 'DeprecationWarning', code: opts.name });
  _writeDeprecationTrace(opts);
}
