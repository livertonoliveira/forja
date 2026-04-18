import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { TraceEventSchema, TraceEvent, Finding, GateDecision } from '../schemas/index.js';

export class TraceWriter {
  private runId: string;
  private tracePath: string;

  constructor(runId: string) {
    z.string().uuid().parse(runId);
    this.runId = runId;
    this.tracePath = path.join('forja', 'state', 'runs', runId, 'trace.jsonl');
  }

  async write(event: Omit<TraceEvent, 'ts'>): Promise<void> {
    const full: TraceEvent = { ...event, ts: new Date().toISOString() };
    TraceEventSchema.parse(full);
    await fs.mkdir(path.dirname(this.tracePath), { recursive: true });
    await fs.appendFile(this.tracePath, JSON.stringify(full) + '\n', { encoding: 'utf8', flag: 'a' });
  }

  async writePhaseStart(phase: string, agentId?: string, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'phase_start',
      agentId,
      spanId,
      payload: { phase },
    });
  }

  async writePhaseEnd(phase: string, status: 'success' | 'failed', spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'phase_end',
      spanId,
      payload: { phase, status },
    });
  }

  async writeToolCall(tool: string, agentId: string, durationMs: number, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'tool_call',
      agentId,
      spanId,
      payload: { tool, durationMs },
    });
  }

  async writeFinding(finding: Finding, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'finding',
      spanId,
      payload: finding as unknown as Record<string, unknown>,
    });
  }

  async writeGateDecision(decision: GateDecision, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'gate',
      spanId,
      payload: decision as unknown as Record<string, unknown>,
    });
  }

  async writeCheckpoint(phase: string, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'checkpoint',
      spanId,
      payload: { checkpoint: true, phase },
    });
  }

  async writeError(error: Error, phase?: string, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'error',
      spanId,
      payload: {
        message: error.message,
        stack: error.stack,
        ...(phase !== undefined ? { phase } : {}),
      },
    });
  }
}
