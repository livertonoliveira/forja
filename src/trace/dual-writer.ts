import { TraceWriter } from './writer.js';
import type { ForjaStore } from '../store/interface.js';
import type { Finding, CostEvent, GateDecision } from '../schemas/index.js';

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/postgres(?:ql)?:\/\/[^\s@]*@[^\s/]*/gi, 'postgres://***@***');
}

// Drizzle's PgTimestamp.mapToDriverValue() calls .toISOString() on the value,
// so Date objects must be passed — not ISO strings — even though the domain
// types declare timestamps as string.
function toDbDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export class DualWriter {
  private writer: TraceWriter;
  private store: ForjaStore;
  private runId: string;
  private phaseIds = new Map<string, string>();

  constructor(writer: TraceWriter, store: ForjaStore, runId: string) {
    this.writer = writer;
    this.store = store;
    this.runId = runId;
  }

  private async settle(...promises: Promise<unknown>[]): Promise<void> {
    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[forja:dual-writer] write failed:', sanitizeError(r.reason));
      }
    }
  }

  async writePhaseStart(phase: string, agentId?: string, spanId?: string, commandFingerprint?: string): Promise<void> {
    if (this.phaseIds.has(phase)) {
      await this.settle(this.writer.writePhaseStart(phase, agentId, spanId, commandFingerprint));
      return;
    }
    await this.settle(
      this.writer.writePhaseStart(phase, agentId, spanId, commandFingerprint),
      this.store
        .createPhase({
          runId: this.runId,
          name: phase,
          startedAt: toDbDate(new Date()) as unknown as string,
          finishedAt: null,
          status: 'running',
        })
        .then((created) => {
          this.phaseIds.set(phase, created.id);
        }),
    );
  }

  async writePhaseEnd(phase: string, status: 'success' | 'failed', spanId?: string): Promise<void> {
    const phaseId = this.phaseIds.get(phase);
    await this.settle(
      this.writer.writePhaseEnd(phase, status, spanId),
      phaseId
        ? this.store.updatePhase(phaseId, {
            finishedAt: toDbDate(new Date()) as unknown as string,
            status,
          })
        : Promise.resolve(),
    );
  }

  async writeFinding(finding: Finding, spanId?: string): Promise<void> {
    await this.settle(
      this.writer.writeFinding(finding, spanId),
      this.store.insertFinding({
        runId: finding.runId,
        phaseId: finding.phaseId,
        agentId: finding.agentId ?? null,
        severity: finding.severity,
        category: finding.category,
        filePath: finding.filePath ?? null,
        line: finding.line ?? null,
        title: finding.title,
        description: finding.description,
        suggestion: finding.suggestion ?? null,
        owasp: finding.owasp ?? null,
        cwe: finding.cwe ?? null,
        createdAt: toDbDate(finding.createdAt) as unknown as string,
      }),
    );
  }

  async writeCostEvent(event: CostEvent, spanId?: string): Promise<void> {
    await this.settle(
      this.writer.write({
        runId: this.runId,
        eventType: 'cost',
        phaseId: event.phaseId,
        agentId: event.agentId,
        spanId: spanId ?? event.spanId,
        payload: {
          costEventId: event.id,
          model: event.model,
          tokensIn: event.tokensIn,
          tokensOut: event.tokensOut,
          costUsd: event.costUsd,
        },
      }),
      // phaseId/agentId come from env vars in the hook context and may not exist
      // in the DB when FORJA_PHASE_ID was not propagated — allSettled handles the FK failure
      this.store.insertCostEvent({
        runId: event.runId,
        phaseId: event.phaseId,
        agentId: event.agentId,
        spanId: event.spanId ?? null,
        model: event.model,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        costUsd: String(event.costUsd),
        createdAt: toDbDate(event.createdAt) as unknown as string,
      }),
    );
  }

  async writeGateDecision(decision: GateDecision, spanId?: string): Promise<void> {
    await this.settle(
      this.writer.writeGateDecision(decision, spanId),
      this.store.insertGateDecision({
        runId: decision.runId,
        phaseId: decision.phaseId ?? null,
        decision: decision.decision,
        criticalCount: decision.criticalCount,
        highCount: decision.highCount,
        mediumCount: decision.mediumCount,
        lowCount: decision.lowCount,
        policyApplied: decision.policyApplied,
        decidedAt: toDbDate(decision.decidedAt) as unknown as string,
      }),
    );
  }

  getPhaseId(phase: string): string | undefined {
    return this.phaseIds.get(phase);
  }

  async writeCheckpoint(phase: string, spanId?: string): Promise<void> {
    await this.settle(this.writer.writeCheckpoint(phase, spanId));
  }

  async writeError(error: Error, phase?: string, spanId?: string): Promise<void> {
    await this.settle(this.writer.writeError(error, phase, spanId));
  }
}
