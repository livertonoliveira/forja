import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import { TraceEventSchema } from '../../src/schemas/index.js';
import { warnDeprecated, resetDeprecationState } from '../../src/deprecation.js';
import { makeRunId, tracePath } from './_helpers.js';

beforeEach(() => {
  resetDeprecationState();
  delete process.env.FORJA_SUPPRESS_DEPRECATION_WARNINGS;
  vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FORJA_RUN_ID;
});

describe('warnDeprecated contract — deprecation_warning event passes TraceEventSchema', () => {
  it('writes a valid JSONL line that parses against TraceEventSchema', async () => {
    const runId = makeRunId();
    process.env.FORJA_RUN_ID = runId;

    warnDeprecated({ name: 'OldApi', since: '1.2.0', removeIn: '1.4.0', replacement: 'NewApi' });

    await new Promise(resolve => setTimeout(resolve, 100));

    const raw = await fs.readFile(tracePath(runId), 'utf8');
    const lines = raw
      .split('\n')
      .filter(l => l.trim() !== '')
      .filter(l => {
        try { return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header'; } catch { return false; }
      });
    expect(lines).toHaveLength(1);

    const event = TraceEventSchema.parse(JSON.parse(lines[0]));
    expect(event).toMatchObject({
      eventType: 'deprecation_warning',
      runId,
      payload: {
        name: 'OldApi',
        since: '1.2.0',
        removeIn: '1.4.0',
        replacement: 'NewApi',
        severity: 'low',
      },
    });
    expect(event.ts).toBeDefined();
  });
});
