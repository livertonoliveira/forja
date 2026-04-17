import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { TraceWriter } from '../../src/trace/writer.js';
import { readTrace, formatTrace } from '../../src/trace/reader.js';
import { TraceEventSchema } from '../../src/schemas/index.js';

describe('simulated run produces valid JSONL trace readable by forja trace', () => {
  const runId = crypto.randomUUID();
  const runDir = path.join('forja', 'state', 'runs', runId);

  afterEach(async () => {
    await fs.rm(runDir, { recursive: true, force: true });
  });

  it('writes 8 events, reads them back validated, and formats correctly', async () => {
    const agentId = crypto.randomUUID();

    const finding = {
      id: crypto.randomUUID(),
      runId,
      phaseId: crypto.randomUUID(),
      severity: 'low' as const,
      category: 'test',
      title: 'Test finding',
      description: 'A test finding',
      createdAt: new Date().toISOString(),
    };

    const gate = {
      id: crypto.randomUUID(),
      runId,
      decision: 'pass' as const,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 1,
      policyApplied: 'default',
      decidedAt: new Date().toISOString(),
    };

    // Step 1: Create writer and emit all 8 events
    const writer = new TraceWriter(runId);
    await writer.writePhaseStart('develop');
    await writer.writePhaseStart('test', agentId);
    await writer.writeToolCall('Bash', agentId, 120);
    await writer.writeFinding(finding);
    await writer.writeGateDecision(gate);
    await writer.writePhaseEnd('develop', 'success');
    await writer.writeCheckpoint('develop');
    await writer.writeError(new Error('test error'), 'test');

    // Step 2: Assert trace file exists
    const tracePath = path.join(runDir, 'trace.jsonl');
    await expect(fs.access(tracePath)).resolves.toBeUndefined();

    // Step 3: Read trace and assert 8 events
    const events = await readTrace(runId);
    expect(events).toHaveLength(8);

    // Step 4: Assert each event validates against TraceEventSchema
    for (const event of events) {
      expect(() => TraceEventSchema.parse(event)).not.toThrow();
    }

    // Step 5: formatTrace 'pretty' — 8 lines, each starts with '['
    const pretty = await formatTrace(events, 'pretty');
    const prettyLines = pretty.split('\n');
    expect(prettyLines).toHaveLength(8);
    for (const line of prettyLines) {
      expect(line.startsWith('[')).toBe(true);
    }

    // Step 6: formatTrace 'md' — contains '| Timestamp |' header
    const md = await formatTrace(events, 'md');
    expect(md).toContain('| Timestamp |');

    // Step 7: formatTrace 'json' — parses to array of length 8
    const json = await formatTrace(events, 'json');
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(8);
  });
});
