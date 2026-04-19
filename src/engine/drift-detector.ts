import { readTrace } from '../trace/reader.js';

export interface DriftReport {
  runId1: string;
  runId2: string;
  drifted: Array<{ phase: string; fingerprint1: string; fingerprint2: string }>;
  unchanged: string[];
  onlyInRun1: string[];
  onlyInRun2: string[];
}

export async function detectCommandDrift(runId1: string, runId2: string): Promise<DriftReport> {
  const [events1, events2] = await Promise.all([readTrace(runId1), readTrace(runId2)]);

  const phaseStarts1 = events1.filter(e => e.eventType === 'phase_start' && e.commandFingerprint);
  const phaseStarts2 = events2.filter(e => e.eventType === 'phase_start' && e.commandFingerprint);

  const fp1 = new Map<string, string>();
  for (const e of phaseStarts1) {
    const phase = typeof e.payload['phase'] === 'string' ? e.payload['phase'] : '';
    if (phase) fp1.set(phase, e.commandFingerprint!);
  }

  const fp2 = new Map<string, string>();
  for (const e of phaseStarts2) {
    const phase = typeof e.payload['phase'] === 'string' ? e.payload['phase'] : '';
    if (phase) fp2.set(phase, e.commandFingerprint!);
  }

  const allPhases = new Set([...fp1.keys(), ...fp2.keys()]);
  const drifted: DriftReport['drifted'] = [];
  const unchanged: string[] = [];

  for (const phase of allPhases) {
    const f1 = fp1.get(phase);
    const f2 = fp2.get(phase);
    if (f1 && f2) {
      if (f1 !== f2) {
        drifted.push({ phase, fingerprint1: f1, fingerprint2: f2 });
      } else {
        unchanged.push(phase);
      }
    }
  }

  const onlyInRun1 = [...fp1.keys()].filter(p => !fp2.has(p));
  const onlyInRun2 = [...fp2.keys()].filter(p => !fp1.has(p));
  return { runId1, runId2, drifted, unchanged, onlyInRun1, onlyInRun2 };
}
