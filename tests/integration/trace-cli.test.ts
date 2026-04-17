import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { TraceWriter } from '../../src/trace/writer.js';
import { readTrace, formatTrace } from '../../src/trace/reader.js';

// Tracks run directories created during tests for cleanup
const createdRunDirs: string[] = [];

function runDir(runId: string): string {
  return path.join('forja', 'state', 'runs', runId);
}

afterEach(async () => {
  for (const dir of createdRunDirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  createdRunDirs.length = 0;
});

async function writeBasicEvents(runId: string): Promise<void> {
  const writer = new TraceWriter(runId);
  await writer.writePhaseStart('develop');
  await writer.writePhaseEnd('develop', 'success');
  createdRunDirs.push(runDir(runId));
}

describe('TraceWriter + readTrace + formatTrace integration', () => {
  it('pretty format contains expected event types', async () => {
    const runId = randomUUID();
    await writeBasicEvents(runId);

    const events = await readTrace(runId);
    expect(events.length).toBe(2);

    const output = await formatTrace(events, 'pretty');
    expect(output).toContain('phase_start');
    expect(output).toContain('phase_end');
    expect(output).toContain(`run=${runId}`);
  });

  it('md format contains Markdown table header "| Timestamp |"', async () => {
    const runId = randomUUID();
    await writeBasicEvents(runId);

    const events = await readTrace(runId);
    const output = await formatTrace(events, 'md');

    expect(output).toContain('| Timestamp |');
    expect(output).toContain('phase_start');
    expect(output).toContain('phase_end');
  });

  it('json format is valid JSON that parses to an array', async () => {
    const runId = randomUUID();
    await writeBasicEvents(runId);

    const events = await readTrace(runId);
    const output = await formatTrace(events, 'json');

    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toHaveProperty('eventType', 'phase_start');
    expect(parsed[1]).toHaveProperty('eventType', 'phase_end');
  });

  it('readTrace on empty trace file returns empty array', async () => {
    const runId = randomUUID();
    const dir = runDir(runId);
    const tracePath = path.join(dir, 'trace.jsonl');
    createdRunDirs.push(dir);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tracePath, '', 'utf8');

    const events = await readTrace(runId);
    expect(events).toEqual([]);
  });

  it('readTrace on non-existent run throws an error', async () => {
    const runId = randomUUID();
    await expect(readTrace(runId)).rejects.toThrow();
  });
});
