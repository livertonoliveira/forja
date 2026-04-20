import path from 'path';
import type { TraceEventRaw } from './jsonl-reader';
import type { Finding } from './types';

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export function parseFindings(runId: string, events: TraceEventRaw[]): Finding[] {
  const phaseNameById: Record<string, string> = {};
  for (const e of events) {
    if (e.eventType === 'phase_start' && e.phaseId) {
      const name = (e.payload?.phase as string | undefined) ?? e.phaseId;
      phaseNameById[e.phaseId] = name;
    }
  }

  return events
    .filter((e) => e.eventType === 'finding')
    .map((e, index) => {
      const payload = e.payload;
      const rawSev = payload.severity as string | undefined;
      const severity = VALID_SEVERITIES.has(rawSev ?? '')
        ? (rawSev as Finding['severity'])
        : 'low';

      const phaseId = e.phaseId;
      const phase = phaseId ? (phaseNameById[phaseId] ?? phaseId) : null;

      const rawFile = (payload.filePath as string | undefined) ?? null;
      const file = rawFile
        ? (rawFile.match(/(?:src|apps|packages)\/.+/) ?? [null])[0] ?? path.basename(rawFile)
        : null;

      return {
        id: (payload.id as string | undefined) ?? `${runId}-${index}`,
        severity,
        category: (payload.category as string | undefined) ?? 'unknown',
        message:
          (payload.title as string | undefined) ??
          (payload.description as string | undefined) ??
          'No message',
        file,
        runId,
        phase,
      };
    });
}
