import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { TraceEventSchema, TraceEvent, CURRENT_SCHEMA_VERSION, isCompatible } from '../schemas/index.js';

export async function readTrace(runId: string, baseDir?: string): Promise<TraceEvent[]> {
  z.string().uuid().parse(runId);
  const root = baseDir ?? process.cwd();
  const tracePath = path.join(root, 'forja', 'state', 'runs', runId, 'trace.jsonl');
  const content = await fs.readFile(tracePath, { encoding: 'utf8' });
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];

  let firstParsed: unknown;
  try {
    firstParsed = JSON.parse(lines[0]);
  } catch {
    throw new Error("Trace file missing schemaVersion header. Run 'forja migrate-trace' to upgrade legacy traces.");
  }
  if (
    typeof firstParsed !== 'object' ||
    firstParsed === null ||
    (firstParsed as Record<string, unknown>)['type'] !== 'header' ||
    typeof (firstParsed as Record<string, unknown>)['schemaVersion'] !== 'string'
  ) {
    throw new Error(
      "Trace file missing schemaVersion header. Run 'forja migrate-trace' to upgrade legacy traces.",
    );
  }
  const firstParsedRecord = firstParsed as Record<string, unknown>;
  const declaredVersion = firstParsedRecord['schemaVersion'] as string;
  if (!isCompatible(declaredVersion, CURRENT_SCHEMA_VERSION)) {
    const safeVersion = String(declaredVersion ?? '').replace(/[^\w.]/g, '').slice(0, 20);
    throw new Error(
      `Trace file uses schemaVersion ${safeVersion} which is incompatible with current version ${CURRENT_SCHEMA_VERSION}. Run 'forja migrate-trace'.`,
    );
  }

  return lines
    .slice(1)
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
