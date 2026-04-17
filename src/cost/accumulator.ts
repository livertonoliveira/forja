import fs from 'fs/promises';
import path from 'path';
import { CostEvent } from '../schemas/index.js';

interface CostLine {
  phase: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export class CostAccumulator {
  private costPath(runId: string): string {
    return path.join('forja', 'state', 'runs', runId, 'cost.jsonl');
  }

  async record(event: CostEvent): Promise<void> {
    const phase = process.env.FORJA_PHASE ?? 'unknown';
    const line: CostLine = {
      phase,
      tokensIn: event.tokensIn,
      tokensOut: event.tokensOut,
      costUsd: event.costUsd,
    };
    const filePath = this.costPath(event.runId);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, JSON.stringify(line) + '\n', 'utf8');
  }

  async getTotal(runId: string): Promise<{ totalUsd: number; byPhase: Record<string, { usd: number; tokens: number }> }> {
    let raw: string;
    try {
      raw = await fs.readFile(this.costPath(runId), 'utf8');
    } catch {
      return { totalUsd: 0, byPhase: {} };
    }

    let totalUsd = 0;
    const byPhase: Record<string, { usd: number; tokens: number }> = {};

    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as CostLine;
        totalUsd += entry.costUsd;
        const prev = byPhase[entry.phase] ?? { usd: 0, tokens: 0 };
        byPhase[entry.phase] = {
          usd: prev.usd + entry.costUsd,
          tokens: prev.tokens + entry.tokensIn + entry.tokensOut,
        };
      } catch {
        // skip malformed lines
      }
    }

    return { totalUsd, byPhase };
  }

  async flush(_runId: string): Promise<void> {
    // no-op: appendFile writes are immediate
  }
}
