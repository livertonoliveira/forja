import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { FindingSchema, Finding } from '../schemas/index.js';
import { TraceWriter } from './writer.js';
import { redact } from '../hooks/redaction.js';

export class FindingWriter {
  private findings: Finding[] = [];
  private findingsPath: string;
  private traceWriter: TraceWriter;

  constructor(private runId: string, private phaseId: string, traceWriter?: TraceWriter) {
    z.string().uuid().parse(runId);
    z.string().uuid().parse(phaseId);
    this.findingsPath = path.join('forja', 'state', 'runs', runId, 'findings.json');
    this.traceWriter = traceWriter ?? new TraceWriter(runId);
  }

  write(finding: Omit<Finding, 'id' | 'runId' | 'phaseId' | 'createdAt'>): void {
    const sanitized = {
      ...finding,
      title: redact(finding.title),
      description: redact(finding.description),
      ...(finding.filePath !== undefined && { filePath: redact(finding.filePath) }),
      ...(finding.suggestion !== undefined && { suggestion: redact(finding.suggestion) }),
    };
    const full: Finding = FindingSchema.parse({
      ...sanitized,
      id: randomUUID(),
      runId: this.runId,
      phaseId: this.phaseId,
      createdAt: new Date().toISOString(),
    });
    this.findings.push(full);
  }

  async flush(): Promise<void> {
    await fs.mkdir(path.dirname(this.findingsPath), { recursive: true });
    await fs.writeFile(this.findingsPath, JSON.stringify(this.findings, null, 2), { encoding: 'utf8' });
    await this._emitToTrace();
  }

  private async _emitToTrace(): Promise<void> {
    await Promise.all(this.findings.map(f => this.traceWriter.writeFinding(f)));
  }

  static async readAll(runId: string): Promise<Finding[]> {
    const findingsPath = path.join('forja', 'state', 'runs', runId, 'findings.json');
    try {
      const raw = await fs.readFile(findingsPath, { encoding: 'utf8' });
      const parsed = JSON.parse(raw) as unknown[];
      return parsed.map(item => FindingSchema.parse(item));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }
}
