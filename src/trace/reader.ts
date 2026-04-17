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
    return events
      .map((e) => {
        const phase = typeof e.payload['phase'] === 'string' ? ` phase=${e.payload['phase']}` : '';
        return `[${e.ts}] ${e.eventType} run=${e.runId}${phase}`;
      })
      .join('\n');
  }

  // md format
  const header = '| Timestamp | Event Type | Run ID | Details |\n|-----------|------------|--------|---------|';
  const rows = events.map((e) => {
    const details = JSON.stringify(e.payload).replace(/\|/g, '\\|');
    return `| ${e.ts} | ${e.eventType} | ${e.runId} | ${details} |`;
  });
  return [header, ...rows].join('\n');
}
