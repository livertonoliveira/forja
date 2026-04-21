import type { Finding } from '../../store/types.js';

export type Severity = Finding['severity'];

export interface EvaluationContext {
  coverage?: { delta: number; absolute: number };
  diff?: { filesChanged: number; linesChanged: number; touched: string[] };
  time?: { phaseDurationMs: number };
  cost?: { usd: number };
  findings?: { countBySeverity: Record<Severity, number> };
}
