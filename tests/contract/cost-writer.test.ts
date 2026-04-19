import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { handlePostToolUse } from '../../src/hooks/post-tool-use.js';
import { CostEventSchema } from '../../src/schemas/index.js';
import { makeRunId, tracePath, costPath } from './_helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

function setEnv(runId: string): void {
  vi.stubEnv('FORJA_RUN_ID', runId);
  vi.stubEnv('FORJA_PHASE_ID', randomUUID());
  vi.stubEnv('FORJA_AGENT_ID', randomUUID());
  vi.stubEnv('FORJA_PHASE', 'test');
  vi.stubEnv('FORJA_MODEL', 'claude-sonnet-4-6');
}

function makeFakePayload() {
  return {
    tool_name: 'Bash',
    tool_use_id: 'toolu_test123',
    usage: { input_tokens: 1000, output_tokens: 500 },
  };
}

describe('cost-writer contract — trace.jsonl cost event conforms to CostEventSchema', () => {
  it('cost event written to trace.jsonl reconstructs to a valid CostEvent', async () => {
    const runId = makeRunId();
    setEnv(runId);

    await handlePostToolUse(makeFakePayload());

    const raw = await fs.readFile(tracePath(runId), 'utf8');
    const lines = raw.split('\n').filter(l => l.trim() !== '');
    const parsed = lines.map(l => JSON.parse(l) as Record<string, unknown>);
    const costEvent = parsed.find(e => e.eventType === 'cost');

    expect(costEvent).toBeDefined();

    const payload = costEvent!.payload as Record<string, unknown>;
    const reconstructed = {
      id: payload.costEventId,
      runId: costEvent!.runId,
      phaseId: costEvent!.phaseId,
      agentId: costEvent!.agentId,
      spanId: costEvent!.spanId,
      model: payload.model,
      tokensIn: payload.tokensIn,
      tokensOut: payload.tokensOut,
      costUsd: payload.costUsd,
      createdAt: costEvent!.ts,
    };

    expect(() => CostEventSchema.parse(reconstructed)).not.toThrow();
  });
});

describe('cost-writer contract — cost.jsonl is created with matching token counts', () => {
  it('cost.jsonl contains a line with tokensIn and tokensOut matching the sent payload', async () => {
    const runId = makeRunId();
    setEnv(runId);

    await handlePostToolUse(makeFakePayload());

    const raw = await fs.readFile(costPath(runId), 'utf8');
    const lines = raw.split('\n').filter(l => l.trim() !== '');

    expect(lines.length).toBeGreaterThanOrEqual(1);

    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry).toMatchObject({ tokensIn: 1000, tokensOut: 500 });
  });
});
