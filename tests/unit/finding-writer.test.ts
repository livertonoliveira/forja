import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ZodError } from 'zod';
import { FindingWriter } from '../../src/trace/finding-writer.js';
import { readTrace } from '../../src/trace/reader.js';
import type { Finding } from '../../src/schemas/index.js';

// Track run IDs created during tests so we can clean them up
const createdRunIds: string[] = [];

function makeRunId(): string {
  const id = randomUUID();
  createdRunIds.push(id);
  return id;
}

function findingsPath(runId: string): string {
  return path.join('forja', 'state', 'runs', runId, 'findings.json');
}

async function cleanupRun(runId: string): Promise<void> {
  try {
    await fs.rm(path.join('forja', 'state', 'runs', runId), { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

afterEach(async () => {
  await Promise.all(createdRunIds.splice(0).map(cleanupRun));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidFinding(): Omit<Finding, 'id' | 'runId' | 'phaseId' | 'createdAt'> {
  return {
    severity: 'medium',
    category: 'security',
    title: 'Test finding',
    description: 'A test finding description',
  };
}

// ---------------------------------------------------------------------------
// 1. write() + flush() produces a valid findings.json parseable as Finding[]
// ---------------------------------------------------------------------------

describe('FindingWriter — write() + flush() produces valid findings.json', () => {
  it('creates findings.json with one valid Finding after write + flush', async () => {
    const runId = makeRunId();
    const phaseId = randomUUID();
    const writer = new FindingWriter(runId, phaseId);

    await writer.write(makeValidFinding());
    await writer.flush();

    const raw = await fs.readFile(findingsPath(runId), 'utf8');
    const parsed = JSON.parse(raw) as unknown[];

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);

    const finding = parsed[0] as Finding;
    expect(finding.runId).toBe(runId);
    expect(finding.phaseId).toBe(phaseId);
    expect(finding.severity).toBe('medium');
    expect(finding.category).toBe('security');
    expect(finding.title).toBe('Test finding');
    expect(finding.id).toBeDefined();
    expect(finding.createdAt).toBeDefined();
  });

  it('accumulates multiple findings and writes all on flush', async () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    await writer.write({ severity: 'critical', category: 'performance', title: 'Finding 1', description: 'desc 1' });
    await writer.write({ severity: 'low', category: 'style', title: 'Finding 2', description: 'desc 2' });
    await writer.flush();

    const raw = await fs.readFile(findingsPath(runId), 'utf8');
    const parsed = JSON.parse(raw) as Finding[];

    expect(parsed).toHaveLength(2);
    expect(parsed[0].severity).toBe('critical');
    expect(parsed[1].severity).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// 2. Invalid finding (missing severity) throws ZodError before writing —
//    the in-memory array must NOT be modified
// ---------------------------------------------------------------------------

describe('FindingWriter — invalid finding throws ZodError before modifying state', () => {
  it('throws ZodError when severity is missing', () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    expect(() =>
      // @ts-expect-error intentionally omitting required severity field
      writer.write({ category: 'security', title: 'Bad finding', description: 'desc' }),
    ).toThrow(ZodError);
  });

  it('does not modify in-memory array when write throws ZodError', async () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    // First write a valid finding
    writer.write(makeValidFinding());

    // Then attempt an invalid write
    expect(() =>
      // @ts-expect-error intentionally omitting required severity field
      writer.write({ category: 'security', title: 'Bad finding', description: 'desc' }),
    ).toThrow(ZodError);

    // Flush and verify only the valid finding was persisted
    await writer.flush();
    const raw = await fs.readFile(findingsPath(runId), 'utf8');
    const parsed = JSON.parse(raw) as Finding[];

    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('Test finding');
  });

  it('throws ZodError when severity has an invalid value', () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    expect(() =>
      writer.write({
        // @ts-expect-error intentionally passing an invalid severity value
        severity: 'unknown-level',
        category: 'security',
        title: 'Bad severity',
        description: 'desc',
      }),
    ).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// 3. static readAll(runId) returns [] when findings.json doesn't exist
// ---------------------------------------------------------------------------

describe('FindingWriter.readAll — returns [] when findings.json does not exist', () => {
  it('returns an empty array for a runId with no findings.json', async () => {
    const runId = makeRunId();
    const result = await FindingWriter.readAll(runId);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. flush() writes all accumulated findings to forja/state/runs/<runId>/findings.json
// ---------------------------------------------------------------------------

describe('FindingWriter — flush() writes to correct path', () => {
  it('creates findings.json at the expected path', async () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    await writer.write(makeValidFinding());
    await writer.flush();

    // File must exist at the expected path
    await expect(fs.access(findingsPath(runId))).resolves.toBeUndefined();
  });

  it('flush() with zero findings creates an empty array file', async () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    await writer.flush();

    const raw = await fs.readFile(findingsPath(runId), 'utf8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });

  it('readAll returns the same findings that were written by flush', async () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    await writer.write({ severity: 'high', category: 'auth', title: 'Auth issue', description: 'Missing auth check' });
    await writer.write({ severity: 'low', category: 'style', title: 'Style nit', description: 'Minor nit' });
    await writer.flush();

    const findings = await FindingWriter.readAll(runId);
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe('high');
    expect(findings[1].severity).toBe('low');
    expect(findings.every((f) => f.runId === runId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Each finding written by flush() also appears as a `finding` event in trace.jsonl
// ---------------------------------------------------------------------------

describe('FindingWriter — flush() emits finding events to trace.jsonl', () => {
  it('each flushed finding produces a finding event in the trace', async () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    await writer.write({ severity: 'critical', category: 'security', title: 'SQL Injection', description: 'Unsanitized input' });
    await writer.write({ severity: 'medium', category: 'performance', title: 'Slow query', description: 'N+1 query' });
    await writer.flush();

    const events = await readTrace(runId);
    const findingEvents = events.filter((e) => e.eventType === 'finding');

    expect(findingEvents).toHaveLength(2);
    for (const event of findingEvents) {
      expect(event.runId).toBe(runId);
      expect(event.eventType).toBe('finding');
    }
  });

  it('finding event payload contains the finding data', async () => {
    const runId = makeRunId();
    const writer = new FindingWriter(runId, randomUUID());

    await writer.write({ severity: 'high', category: 'security', title: 'XSS Vulnerability', description: 'Reflected XSS' });
    await writer.flush();

    const events = await readTrace(runId);
    const findingEvent = events.find((e) => e.eventType === 'finding');

    expect(findingEvent).toBeDefined();
    expect(findingEvent!.payload['severity']).toBe('high');
    expect(findingEvent!.payload['title']).toBe('XSS Vulnerability');
  });
});

// ---------------------------------------------------------------------------
// 6. Constructor throws if runId or phaseId is not a valid UUID
// ---------------------------------------------------------------------------

describe('FindingWriter constructor — throws on invalid UUIDs', () => {
  it('throws ZodError when runId is not a valid UUID', () => {
    expect(() => new FindingWriter('not-a-uuid', randomUUID())).toThrow(ZodError);
  });

  it('throws ZodError when phaseId is not a valid UUID', () => {
    expect(() => new FindingWriter(randomUUID(), 'not-a-uuid')).toThrow(ZodError);
  });

  it('throws ZodError when both runId and phaseId are invalid', () => {
    expect(() => new FindingWriter('bad-id', 'also-bad')).toThrow(ZodError);
  });

  it('does not throw when both runId and phaseId are valid UUIDs', () => {
    expect(() => new FindingWriter(randomUUID(), randomUUID())).not.toThrow();
  });
});
