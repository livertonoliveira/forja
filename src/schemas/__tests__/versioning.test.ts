import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseSchemaVersion, isCompatible, CURRENT_SCHEMA_VERSION } from '../versioning.js';
import { TraceWriter } from '../../trace/writer.js';
import { readTrace } from '../../trace/reader.js';

// ---------------------------------------------------------------------------
// parseSchemaVersion
// ---------------------------------------------------------------------------
describe('parseSchemaVersion', () => {
  it('parses "1.0" correctly', () => {
    expect(parseSchemaVersion('1.0')).toEqual({ major: 1, minor: 0 });
  });

  it('parses "2.5" correctly', () => {
    expect(parseSchemaVersion('2.5')).toEqual({ major: 2, minor: 5 });
  });

  it('throws on "invalid"', () => {
    expect(() => parseSchemaVersion('invalid')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseSchemaVersion('')).toThrow();
  });

  it('throws on "1" (no minor)', () => {
    expect(() => parseSchemaVersion('1')).toThrow();
  });

  it('throws on "1.0.0" (semver)', () => {
    expect(() => parseSchemaVersion('1.0.0')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// isCompatible
// ---------------------------------------------------------------------------
describe('isCompatible', () => {
  it('isCompatible("1.0", "1.0") → true', () => {
    expect(isCompatible('1.0', '1.0')).toBe(true);
  });

  it('isCompatible("1.0", "2.0") → false (major mismatch)', () => {
    expect(isCompatible('1.0', '2.0')).toBe(false);
  });

  it('isCompatible("2.0", "1.0") → false (major mismatch)', () => {
    expect(isCompatible('2.0', '1.0')).toBe(false);
  });

  it('isCompatible("1.1", "1.0") → true (same major)', () => {
    expect(isCompatible('1.1', '1.0')).toBe(true);
  });

  it('isCompatible("1.0", "1.1") → true (same major)', () => {
    expect(isCompatible('1.0', '1.1')).toBe(true);
  });

  it('isCompatible("2.3", "2.9") → true (same major)', () => {
    expect(isCompatible('2.3', '2.9')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JSONL header — writer injects header on first write
// ---------------------------------------------------------------------------
describe('TraceWriter — header injection', () => {
  const RUN_ID = '00000000-0000-4000-8000-000000000001';
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forja-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes a valid header as line 1 on first write', async () => {
    const writer = new TraceWriter(RUN_ID, tmpDir);
    await writer.write({
      runId: RUN_ID,
      eventType: 'run_start',
      payload: { source: 'test' },
    });

    const tracePath = path.join(tmpDir, 'forja', 'state', 'runs', RUN_ID, 'trace.jsonl');
    const content = await fs.readFile(tracePath, { encoding: 'utf8' });
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    expect(lines.length).toBeGreaterThanOrEqual(2);

    const header = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(header['type']).toBe('header');
    expect(header['schemaVersion']).toBe(CURRENT_SCHEMA_VERSION);
    expect(typeof header['createdAt']).toBe('string');
    expect(header['runId']).toBe(RUN_ID);
  });

  it('does not inject a second header on subsequent writes', async () => {
    const writer = new TraceWriter(RUN_ID, tmpDir);
    await writer.write({ runId: RUN_ID, eventType: 'run_start', payload: {} });
    await writer.write({ runId: RUN_ID, eventType: 'run_end', payload: { status: 'success' } });

    const tracePath = path.join(tmpDir, 'forja', 'state', 'runs', RUN_ID, 'trace.jsonl');
    const content = await fs.readFile(tracePath, { encoding: 'utf8' });
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    const headerLines = lines.filter((l) => {
      try {
        const parsed = JSON.parse(l) as Record<string, unknown>;
        return parsed['type'] === 'header';
      } catch {
        return false;
      }
    });

    expect(headerLines.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// readTrace — header validation
// ---------------------------------------------------------------------------
describe('readTrace — header validation', () => {
  const RUN_ID = '00000000-0000-4000-8000-000000000002';
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forja-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeRawTrace(runId: string, lines: string[]): Promise<void> {
    const dir = path.join(tmpDir, 'forja', 'state', 'runs', runId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'trace.jsonl'), lines.join('\n') + '\n', { encoding: 'utf8' });
  }

  it('throws when line 1 is missing the header (plain event instead)', async () => {
    const event = JSON.stringify({
      ts: '2024-01-01T00:00:00.000Z',
      runId: RUN_ID,
      eventType: 'run_start',
      payload: {},
    });
    await writeRawTrace(RUN_ID, [event]);

    await expect(readTrace(RUN_ID, tmpDir)).rejects.toThrow(
      "Trace file missing schemaVersion header. Run 'forja migrate-trace' to upgrade legacy traces.",
    );
  });

  it('throws when header has an incompatible schemaVersion', async () => {
    const header = JSON.stringify({
      type: 'header',
      schemaVersion: '9.0',
      createdAt: new Date().toISOString(),
      runId: RUN_ID,
    });
    await writeRawTrace(RUN_ID, [header]);

    await expect(readTrace(RUN_ID, tmpDir)).rejects.toThrow(
      "Trace file uses schemaVersion 9.0 which is incompatible with current version 1.0. Run 'forja migrate-trace'.",
    );
  });

  it('reads events normally when header is valid', async () => {
    const writer = new TraceWriter(RUN_ID, tmpDir);
    await writer.write({ runId: RUN_ID, eventType: 'run_start', payload: { source: 'test' } });

    const events = await readTrace(RUN_ID, tmpDir);
    expect(events.length).toBe(1);
    expect(events[0].eventType).toBe('run_start');
  });

  it('returns empty array for a file with only a valid header', async () => {
    const header = JSON.stringify({
      type: 'header',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      runId: RUN_ID,
    });
    await writeRawTrace(RUN_ID, [header]);

    const events = await readTrace(RUN_ID, tmpDir);
    expect(events).toEqual([]);
  });
});
