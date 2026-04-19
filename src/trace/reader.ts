import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { TraceEventSchema, TraceEvent } from '../schemas/index.js';

export async function readTrace(runId: string): Promise<TraceEvent[]> {
  z.string().uuid().parse(runId);
  const tracePath = path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
  const content = await fs.readFile(tracePath, { encoding: 'utf8' });
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => TraceEventSchema.parse(JSON.parse(line)));
}

export async function formatTrace(events: TraceEvent[], format: 'pretty' | 'md' | 'json'): Promise<string> {
  if (format === 'json') {
    return JSON.stringify(events, null, 2);
  }

  if (format === 'pretty') {
    // Group by root events (no spanId) and span events
    const rootEvents = events.filter(e => !e.spanId);
    const spanGroups = new Map<string, TraceEvent[]>();

    for (const e of events) {
      if (e.spanId) {
        const group = spanGroups.get(e.spanId) ?? [];
        group.push(e);
        spanGroups.set(e.spanId, group);
      }
    }

    const lines: string[] = [];

    // Interleave root events and span groups in chronological order
    const allRootTs = rootEvents.map(e => ({ ts: e.ts, type: 'root' as const, event: e }));
    const spanStarts = [...spanGroups.entries()].map(([spanId, evts]) => ({
      ts: evts[0].ts,
      type: 'span' as const,
      spanId,
      events: evts,
    }));

    const sorted = [...allRootTs, ...spanStarts].sort((a, b) => a.ts.localeCompare(b.ts));

    const seenSpans = new Set<string>();

    for (const item of sorted) {
      if (item.type === 'root') {
        const e = item.event;
        const phase = typeof e.payload['phase'] === 'string' ? ` phase=${e.payload['phase']}` : '';
        const fp = e.eventType === 'phase_start' && e.commandFingerprint ? ` [fp: ${e.commandFingerprint}]` : '';
        lines.push(`[${e.ts}] ${e.eventType} run=${e.runId}${phase}${fp}`);
      } else {
        const spanId = item.spanId;
        if (seenSpans.has(spanId)) continue;
        seenSpans.add(spanId);
        const spanEvts = item.events;
        for (let i = 0; i < spanEvts.length; i++) {
          const e = spanEvts[i];
          const prefix = i < spanEvts.length - 1 ? '  ├─' : '  └─';
          const phase = typeof e.payload['phase'] === 'string' ? ` phase=${e.payload['phase']}` : '';
          const safeSpan = spanId.replace(/[^\w-]/g, '?').slice(0, 6);
          lines.push(`[${e.ts}] ${prefix} [span:${safeSpan}] ${e.eventType}${phase}`);
        }
      }
    }

    return lines.join('\n');
  }

  // md format
  const header = '| Timestamp | Event Type | Run ID | Details |\n|-----------|------------|--------|---------|';
  const rows = events.map((e) => {
    const details = JSON.stringify(e.payload).replace(/\|/g, '\\|');
    return `| ${e.ts} | ${e.eventType} | ${e.runId} | ${details} |`;
  });
  return [header, ...rows].join('\n');
}
