import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { handlePostToolUse } from '../../src/hooks/post-tool-use.js';
import { TraceEventSchema } from '../../src/schemas/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    tool_name: 'Bash',
    tool_input: { command: 'echo hi' },
    tool_response: { output: 'hi' },
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
    ...overrides,
  };
}

async function readTraceEvents(runId: string, tmpDir: string) {
  const tracePath = path.join(tmpDir, 'forja', 'state', 'runs', runId, 'trace.jsonl');
  const content = await fs.readFile(tracePath, 'utf8');
  return content
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => TraceEventSchema.parse(JSON.parse(l)));
}

// ---------------------------------------------------------------------------
// Env & cwd management
// ---------------------------------------------------------------------------

let originalCwd: string;
let tmpDir: string;

const ENV_VARS = [
  'FORJA_RUN_ID',
  'FORJA_SPAN_ID',
  'FORJA_PHASE',
  'FORJA_PHASE_ID',
  'FORJA_AGENT_ID',
  'FORJA_MODEL',
];

beforeEach(async () => {
  // Create a fresh temp dir per test so trace files don't collide
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forja-ptu-test-'));
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  // Restore cwd first, then clean env
  process.chdir(originalCwd);
  for (const v of ENV_VARS) {
    delete process.env[v];
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 6. When FORJA_SPAN_ID is set, the cost TraceEvent written to file contains spanId
// ---------------------------------------------------------------------------

describe('handlePostToolUse — with FORJA_SPAN_ID set', () => {
  it('writes a cost TraceEvent that includes the spanId field', async () => {
    const runId = randomUUID();
    const spanId = 'myspan1234567890';

    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_SPAN_ID = spanId;
    process.env.FORJA_PHASE = 'develop';
    process.env.FORJA_PHASE_ID = randomUUID();
    process.env.FORJA_AGENT_ID = randomUUID();

    await handlePostToolUse(validPayload());

    const events = await readTraceEvents(runId, tmpDir);
    expect(events).toHaveLength(1);

    const event = events[0];
    expect(event.eventType).toBe('cost');
    expect(event.spanId).toBe(spanId);
  });

  it('the spanId in the trace event matches FORJA_SPAN_ID exactly', async () => {
    const runId = randomUUID();
    const spanId = 'exactmatch567890';

    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_SPAN_ID = spanId;
    process.env.FORJA_PHASE_ID = randomUUID();
    process.env.FORJA_AGENT_ID = randomUUID();

    await handlePostToolUse(validPayload());

    const events = await readTraceEvents(runId, tmpDir);
    expect(events[0].spanId).toBe(spanId);
  });
});

// ---------------------------------------------------------------------------
// 7. When FORJA_SPAN_ID is not set, the cost TraceEvent does not have spanId
// ---------------------------------------------------------------------------

describe('handlePostToolUse — without FORJA_SPAN_ID set', () => {
  it('writes a cost TraceEvent without a spanId field', async () => {
    const runId = randomUUID();

    process.env.FORJA_RUN_ID = runId;
    // Explicitly ensure FORJA_SPAN_ID is absent
    delete process.env.FORJA_SPAN_ID;
    process.env.FORJA_PHASE = 'test';
    process.env.FORJA_PHASE_ID = randomUUID();
    process.env.FORJA_AGENT_ID = randomUUID();

    await handlePostToolUse(validPayload());

    const events = await readTraceEvents(runId, tmpDir);
    expect(events).toHaveLength(1);

    const event = events[0];
    expect(event.eventType).toBe('cost');
    expect(event.spanId).toBeUndefined();
  });

  it('spanId key is absent in the raw JSON line written to trace.jsonl', async () => {
    const runId = randomUUID();

    process.env.FORJA_RUN_ID = runId;
    delete process.env.FORJA_SPAN_ID;
    process.env.FORJA_PHASE_ID = randomUUID();
    process.env.FORJA_AGENT_ID = randomUUID();

    await handlePostToolUse(validPayload());

    const tracePath = path.join(tmpDir, 'forja', 'state', 'runs', runId, 'trace.jsonl');
    const raw = await fs.readFile(tracePath, 'utf8');
    const parsed = JSON.parse(raw.trim());

    // spanId must not be serialized when absent
    expect(Object.prototype.hasOwnProperty.call(parsed, 'spanId')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge case: missing usage skips writing (no trace file created)
// ---------------------------------------------------------------------------

describe('handlePostToolUse — invalid payload does not write trace', () => {
  it('does not create a trace file when usage is missing', async () => {
    const runId = randomUUID();

    process.env.FORJA_RUN_ID = runId;
    process.env.FORJA_SPAN_ID = 'some-span-id';

    await handlePostToolUse({ tool_name: 'Bash' }); // no usage field

    const tracePath = path.join(tmpDir, 'forja', 'state', 'runs', runId, 'trace.jsonl');
    await expect(fs.access(tracePath)).rejects.toThrow();
  });
});
