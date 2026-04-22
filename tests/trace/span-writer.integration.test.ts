import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { TraceWriter } from '../../src/trace/writer.js';
import { spawnAgent } from '../../src/engine/index.js';

// ---------------------------------------------------------------------------
// Setup: each test suite runs in a fresh tmpdir so it doesn't pollute the
// project state. We chdir into the temp root before the suite and restore
// the original cwd afterwards.
// ---------------------------------------------------------------------------

let tempRoot: string;
let originalCwd: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'forja-span-integration-'));
  process.chdir(tempRoot);
});

afterAll(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

// Each test registers its runId here so we can clean up the run directory
// without touching other tests' state.
const usedRunIds: string[] = [];

afterEach(async () => {
  for (const runId of usedRunIds.splice(0)) {
    const dir = path.join(tempRoot, 'forja', 'state', 'runs', runId);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function makeRunId(): string {
  const id = randomUUID();
  usedRunIds.push(id);
  return id;
}

function tracePath(runId: string): string {
  return path.join(tempRoot, 'forja', 'state', 'runs', runId, 'trace.jsonl');
}

async function readEvents(runId: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(tracePath(runId), 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .filter((l) => {
      try { return (JSON.parse(l) as Record<string, unknown>)['type'] !== 'header'; } catch { return false; }
    })
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// 1. writePhaseStart with spanId writes event with spanId in the JSONL file
// ---------------------------------------------------------------------------

describe('writePhaseStart with spanId', () => {
  it('persists spanId in the written event', async () => {
    const runId = makeRunId();
    const spanId = 'span-abc-123';
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('develop', undefined, spanId);

    const events = await readEvents(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('phase_start');
    expect(events[0].spanId).toBe(spanId);
  });
});

// ---------------------------------------------------------------------------
// 2. writePhaseStart without spanId writes event without spanId field
// ---------------------------------------------------------------------------

describe('writePhaseStart without spanId', () => {
  it('does not include spanId in the written event', async () => {
    const runId = makeRunId();
    const writer = new TraceWriter(runId);

    await writer.writePhaseStart('test');

    const events = await readEvents(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('phase_start');
    expect(events[0].spanId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. writeToolCall with spanId persists spanId in the event
// ---------------------------------------------------------------------------

describe('writeToolCall with spanId', () => {
  it('persists spanId in the tool_call event', async () => {
    const runId = makeRunId();
    const agentId = randomUUID();
    const spanId = 'tool-span-xyz';
    const writer = new TraceWriter(runId);

    await writer.writeToolCall('Bash', agentId, 500, spanId);

    const events = await readEvents(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('tool_call');
    expect(events[0].spanId).toBe(spanId);
    expect(events[0].agentId).toBe(agentId);
  });
});

// ---------------------------------------------------------------------------
// 4. writeCheckpoint with spanId persists spanId
// ---------------------------------------------------------------------------

describe('writeCheckpoint with spanId', () => {
  it('persists spanId in the checkpoint event', async () => {
    const runId = makeRunId();
    const spanId = 'checkpoint-span-789';
    const writer = new TraceWriter(runId);

    await writer.writeCheckpoint('security', spanId);

    const events = await readEvents(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('checkpoint');
    expect(events[0].spanId).toBe(spanId);
    expect(events[0].payload).toMatchObject({ checkpoint: true, phase: 'security' });
  });
});

// ---------------------------------------------------------------------------
// 5. spawnAgent() writes an agent_start event to the trace file
// ---------------------------------------------------------------------------

describe('spawnAgent — agent_start event', () => {
  it('writes an agent_start event to the trace file', async () => {
    const runId = makeRunId();

    await spawnAgent({ runId, phase: 'develop' });

    const events = await readEvents(runId);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('agent_start');
    expect(events[0].runId).toBe(runId);
    expect(events[0].payload).toMatchObject({ phase: 'develop' });
  });
});

// ---------------------------------------------------------------------------
// 6. spawnAgent() returns unique spanId and agentId
// ---------------------------------------------------------------------------

describe('spawnAgent — return values', () => {
  it('returns a non-empty spanId and a valid UUID agentId', async () => {
    const runId = makeRunId();

    const context = await spawnAgent({ runId, phase: 'test' });

    expect(typeof context.spanId).toBe('string');
    expect(context.spanId.length).toBeGreaterThan(0);
    expect(typeof context.agentId).toBe('string');
    // agentId must be a valid UUID
    expect(context.agentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 7. spawnAgent() returns env with FORJA_SPAN_ID and FORJA_AGENT_ID
// ---------------------------------------------------------------------------

describe('spawnAgent — env object', () => {
  it('returns env with FORJA_SPAN_ID and FORJA_AGENT_ID set to spanId and agentId', async () => {
    const runId = makeRunId();

    const context = await spawnAgent({ runId, phase: 'review' });

    expect(context.env).toHaveProperty('FORJA_SPAN_ID', context.spanId);
    expect(context.env).toHaveProperty('FORJA_AGENT_ID', context.agentId);
  });
});

// ---------------------------------------------------------------------------
// 8. Two spawnAgent() calls return different spanIds
// ---------------------------------------------------------------------------

describe('spawnAgent — uniqueness', () => {
  it('two calls return different spanIds', async () => {
    const runId1 = makeRunId();
    const runId2 = makeRunId();

    const ctx1 = await spawnAgent({ runId: runId1, phase: 'perf' });
    const ctx2 = await spawnAgent({ runId: runId2, phase: 'perf' });

    expect(ctx1.spanId).not.toBe(ctx2.spanId);
    expect(ctx1.agentId).not.toBe(ctx2.agentId);
  });
});
