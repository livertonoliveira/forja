import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { TraceEventSchema, TraceEvent, Finding, GateDecision, CURRENT_SCHEMA_VERSION } from '../schemas/index.js';

// Avoids repeated fs.mkdir syscalls within the same process (e.g. long-running runs).
const _mkdirCache = new Set<string>();

async function ensureDir(dirPath: string): Promise<void> {
  if (_mkdirCache.has(dirPath)) return;
  await fs.mkdir(dirPath, { recursive: true });
  _mkdirCache.add(dirPath);
}

export class TraceWriter {
  private runId: string;
  private tracePath: string;
  private _headerWritten = false;

  constructor(runId: string, baseDir?: string) {
    z.string().uuid().parse(runId);
    this.runId = runId;
    const root = baseDir ?? process.cwd();
    this.tracePath = path.join(root, 'forja', 'state', 'runs', runId, 'trace.jsonl');
  }

  async writeHeader(): Promise<void> {
    const dir = path.dirname(this.tracePath);
    await fs.mkdir(dir, { recursive: true });
    const header = {
      type: 'header',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      runId: this.runId,
    };
    await fs.writeFile(this.tracePath, JSON.stringify(header) + '\n', { encoding: 'utf8' });
  }

  async write(event: Omit<TraceEvent, 'ts' | 'schemaVersion'>): Promise<void> {
    const full: TraceEvent = { ...event, schemaVersion: CURRENT_SCHEMA_VERSION, ts: new Date().toISOString() };
    // Skip validation in production — TypeScript types guarantee correctness at call sites.
    if (process.env.NODE_ENV !== 'production') {
      const result = TraceEventSchema.safeParse(full);
      if (!result.success) throw result.error;
    }
    await ensureDir(path.dirname(this.tracePath));
    if (!this._headerWritten) {
      await this.writeHeader();
      this._headerWritten = true;
    }
    await fs.appendFile(this.tracePath, JSON.stringify(full) + '\n', { encoding: 'utf8', flag: 'a' });
  }

  async writePhaseStart(phase: string, agentId?: string, spanId?: string, commandFingerprint?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'phase_start',
      agentId,
      spanId,
      commandFingerprint,
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

  async writePluginRegistered(plugin: { id: string; source: string; version: string; path: string }, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'plugin_registered',
      spanId,
      payload: { id: plugin.id, source: plugin.source, version: plugin.version, path: plugin.path },
    });
  }

  async writeError(error: Error, phase?: string, spanId?: string): Promise<void> {
    await this.write({
      runId: this.runId,
      eventType: 'error',
      spanId,
      payload: {
        message: error.message,
        stack: process.env.NODE_ENV !== 'production'
          ? error.stack
          : error.stack?.split('\n').map(l => l.replace(/\(\/[^)]+\)/g, '(<redacted>)')).join('\n'),
        ...(phase !== undefined ? { phase } : {}),
      },
    });
  }
}
