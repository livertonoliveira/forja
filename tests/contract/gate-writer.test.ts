import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import { TraceWriter } from '../../src/trace/writer.js';
import { FindingWriter } from '../../src/trace/finding-writer.js';
import { GateDecisionSchema, CURRENT_SCHEMA_VERSION } from '../../src/schemas/index.js';
import type { GateDecision } from '../../src/schemas/index.js';
import { makeRunId, tracePath } from './_helpers.js';

async function readGateEventPayload(runId: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(tracePath(runId), 'utf8');
  const gateEvent = raw
    .split('\n')
    .filter(l => l.trim() !== '')
    .map(l => JSON.parse(l) as Record<string, unknown>)
    .find(e => e.eventType === 'gate');
  if (!gateEvent) throw new Error('No gate event found in trace.jsonl');
  return gateEvent.payload as Record<string, unknown>;
}

describe('gate-writer contract — fail decision with findings conforms to GateDecisionSchema', () => {
  it('gate event payload from a fail decision parses against GateDecisionSchema', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();

    const findingWriter = new FindingWriter(runId, phaseId);
    findingWriter.write({ severity: 'critical', category: 'injection', title: 'SQL Injection', description: 'Unsanitized input used in query' });
    findingWriter.write({ severity: 'high', category: 'auth', title: 'Missing auth check', description: 'Endpoint lacks authentication' });
    findingWriter.write({ severity: 'medium', category: 'performance', title: 'N+1 query', description: 'Query inside loop' });
    findingWriter.write({ severity: 'low', category: 'style', title: 'Missing type annotation', description: 'Parameter lacks explicit type' });
    await findingWriter.flush();

    const gateDecision: GateDecision = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: randomUUID(),
      runId,
      decision: 'fail',
      criticalCount: 1,
      highCount: 1,
      mediumCount: 1,
      lowCount: 1,
      policyApplied: 'policies/default.yaml',
      justification: null,
      decidedAt: new Date().toISOString(),
    };

    await new TraceWriter(runId).writeGateDecision(gateDecision);

    const payload = await readGateEventPayload(runId);
    expect(() => GateDecisionSchema.parse(payload)).not.toThrow();
  });
});

describe('gate-writer contract — pass decision with zero findings conforms to GateDecisionSchema', () => {
  it('gate event payload from a pass decision parses against GateDecisionSchema', async () => {
    const runId = makeRunId();

    const gateDecision: GateDecision = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: randomUUID(),
      runId,
      decision: 'pass',
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      policyApplied: 'policies/default.yaml',
      justification: null,
      decidedAt: new Date().toISOString(),
    };

    await new TraceWriter(runId).writeGateDecision(gateDecision);

    const payload = await readGateEventPayload(runId);
    expect(() => GateDecisionSchema.parse(payload)).not.toThrow();
  });
});
