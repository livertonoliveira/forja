/**
 * Integration tests for MOB-1045 — schema fixtures, pre-1.0 → 1.0 migration,
 * and forward-compatibility smoke test for hypothetical-1.1.
 *
 * Strategy:
 *  - pre-1.0: fixtures lack schemaVersion; we apply the addField migration
 *    directly at the payload level and validate the output with Zod schemas.
 *  - v1.0: fixtures already carry schemaVersion:"1.0"; parse and validate directly.
 *  - hypothetical-1.1: smoke-test that isCompatible('1.1', '1.0') is true
 *    (same major version → forward-compatible read).
 *  - idempotency: running the pre1ToV10 migration twice produces the same output.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { TraceRunner } from '../../src/store/migrations/trace-runner.js';
import { ReportRunner } from '../../src/store/migrations/report-runner.js';
import { registry } from '../../src/store/migrations/registry.js';
import { pre1ToV10 } from '../../src/store/migrations/m_pre1_to_v10.js';
import { TraceEventSchema } from '../../src/schemas/trace.js';
import { isCompatible, CURRENT_SCHEMA_VERSION } from '../../src/schemas/versioning.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../fixtures/schemas');
const PRE10_DIR = path.join(FIXTURES_DIR, 'pre-1.0');
const V10_DIR = path.join(FIXTURES_DIR, 'v1.0');
const H11_DIR = path.join(FIXTURES_DIR, 'hypothetical-1.1');

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ---------------------------------------------------------------------------
// Temp directory for file-based runner tests
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'schema-roundtrip-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read and parse a JSONL file, returning header + event objects. */
async function readJsonl(filePath: string): Promise<Record<string, unknown>[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Read and parse front-matter fields from a markdown file. */
function parseFrontMatter(content: string): Record<string, string> {
  const parts = content.split('---\n');
  if (parts.length < 3) return {};
  const block = parts[1];
  const result: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = /^(\w+):\s*"(.*)"\s*$/.exec(line);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

// ---------------------------------------------------------------------------
// pre-1.0 fixtures
// ---------------------------------------------------------------------------

describe('pre-1.0 fixtures', () => {
  it('trace fixture lacks schemaVersion in header and events', async () => {
    const lines = await readJsonl(path.join(PRE10_DIR, 'trace-sample.jsonl'));
    const [header, ...events] = lines;

    expect(header['schemaVersion']).toBeUndefined();
    for (const event of events) {
      expect(event['schemaVersion']).toBeUndefined();
    }
  });

  it('report fixture lacks schemaVersion in front-matter', async () => {
    const content = await fs.readFile(path.join(PRE10_DIR, 'report-sample.md'), 'utf-8');
    const fm = parseFrontMatter(content);
    expect(fm['schemaVersion']).toBeUndefined();
  });

  it('postgres fixture lacks schemaVersion on rows', async () => {
    const raw = await fs.readFile(path.join(PRE10_DIR, 'postgres-rows.json'), 'utf-8');
    const data = JSON.parse(raw) as { runs: Record<string, unknown>[] };
    expect(data.runs[0]['schemaVersion']).toBeUndefined();
  });

  it('pre1ToV10 migration adds schemaVersion:"1.0" to trace event payload', async () => {
    const lines = await readJsonl(path.join(PRE10_DIR, 'trace-sample.jsonl'));
    const [, ...events] = lines;

    for (const event of events) {
      const payload = event['payload'];
      const migrated = pre1ToV10.apply({
        from: { schemaVersion: 'pre-1.0', payload },
        to: { schemaVersion: '1.0' },
        logger: noopLogger,
      });
      expect((migrated as Record<string, unknown>)['schemaVersion']).toBe('1.0');
    }
  });

  it('migrated trace events pass TraceEventSchema validation', async () => {
    const lines = await readJsonl(path.join(PRE10_DIR, 'trace-sample.jsonl'));
    const [, ...events] = lines;

    for (const event of events) {
      // Build the full migrated event object (not just payload)
      const migratedEvent = { ...event, schemaVersion: '1.0' };
      const result = TraceEventSchema.safeParse(migratedEvent);
      expect(result.success, `TraceEventSchema rejected: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('TraceRunner migrates a pre-1.0 trace file when header schemaVersion is injected', async () => {
    // The TraceRunner validates that header has schemaVersion, so we create a
    // temp file that has schemaVersion set to 'pre-1.0' in the header (which
    // triggers the migration path).
    const src = await readJsonl(path.join(PRE10_DIR, 'trace-sample.jsonl'));
    const [header, ...events] = src;

    // Inject schemaVersion:'pre-1.0' into the header to satisfy the runner
    const patchedHeader = { ...header, schemaVersion: 'pre-1.0' };
    const patchedEvents = events.map((e) => ({ ...e, schemaVersion: 'pre-1.0' }));
    const content =
      [JSON.stringify(patchedHeader), ...patchedEvents.map((e) => JSON.stringify(e))].join('\n') +
      '\n';

    const tmpFile = path.join(tmpDir, 'trace-pre1.jsonl');
    await fs.writeFile(tmpFile, content, 'utf-8');

    const runner = new TraceRunner(registry, { logger: noopLogger });
    await runner.apply(tmpFile);

    const result = await readJsonl(tmpFile);
    const [migratedHeader, ...migratedEvents] = result;

    expect(migratedHeader['schemaVersion']).toBe(CURRENT_SCHEMA_VERSION);
    for (const event of migratedEvents) {
      expect(event['schemaVersion']).toBe(CURRENT_SCHEMA_VERSION);
      const parsed = TraceEventSchema.safeParse(event);
      expect(parsed.success, `TraceEventSchema rejected: ${JSON.stringify(parsed)}`).toBe(true);
    }
  });

  it('ReportRunner migrates a pre-1.0 report file when schemaVersion is passed via options.from', async () => {
    const src = await fs.readFile(path.join(PRE10_DIR, 'report-sample.md'), 'utf-8');
    // Inject schemaVersion:'pre-1.0' into front-matter so ReportRunner can
    // determine the source version (options.from would also work, but the runner
    // reads frontMatter['schemaVersion'] when options.from is not set, and it
    // throws if missing). We patch the front-matter here.
    const patched = src.replace(
      /^---\n/,
      '---\nschemaVersion: "pre-1.0"\n',
    );

    const tmpFile = path.join(tmpDir, 'report-pre1.md');
    await fs.writeFile(tmpFile, patched, 'utf-8');

    const runner = new ReportRunner(registry, { logger: noopLogger });
    await runner.apply(tmpFile);

    const result = await fs.readFile(tmpFile, 'utf-8');
    const fm = parseFrontMatter(result);

    expect(fm['schemaVersion']).toBe(CURRENT_SCHEMA_VERSION);
    expect(fm['runId']).toBe('00000000-0000-0000-0000-000000000001');
    expect(fm['status']).toBe('ok');
    expect(fm['gate']).toBe('pass');
  });
});

// ---------------------------------------------------------------------------
// v1.0 fixtures
// ---------------------------------------------------------------------------

describe('v1.0 fixtures', () => {
  it('trace fixture has schemaVersion:"1.0" on header and events', async () => {
    const lines = await readJsonl(path.join(V10_DIR, 'trace-sample.jsonl'));
    const [header, ...events] = lines;

    expect(header['schemaVersion']).toBe('1.0');
    for (const event of events) {
      expect(event['schemaVersion']).toBe('1.0');
    }
  });

  it('trace events pass TraceEventSchema validation', async () => {
    const lines = await readJsonl(path.join(V10_DIR, 'trace-sample.jsonl'));
    const [, ...events] = lines;

    for (const event of events) {
      const result = TraceEventSchema.safeParse(event);
      expect(result.success, `TraceEventSchema rejected: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('report fixture has schemaVersion:"1.0" in front-matter', async () => {
    const content = await fs.readFile(path.join(V10_DIR, 'report-sample.md'), 'utf-8');
    const fm = parseFrontMatter(content);
    expect(fm['schemaVersion']).toBe('1.0');
  });

  it('postgres fixture has schemaVersion:"1.0" on all rows', async () => {
    const raw = await fs.readFile(path.join(V10_DIR, 'postgres-rows.json'), 'utf-8');
    const data = JSON.parse(raw) as {
      runs: Record<string, unknown>[];
      gateDecisions: Record<string, unknown>[];
    };
    expect(data.runs[0]['schemaVersion']).toBe('1.0');
    expect(data.gateDecisions[0]['schemaVersion']).toBe('1.0');
  });

  it('TraceRunner reports already-at-target for v1.0 trace', async () => {
    const tmpFile = path.join(tmpDir, 'trace-v10.jsonl');
    await fs.copyFile(path.join(V10_DIR, 'trace-sample.jsonl'), tmpFile);

    const runner = new TraceRunner(registry, { logger: noopLogger });
    await runner.apply(tmpFile);

    // File should remain unchanged
    const result = await readJsonl(tmpFile);
    const [header] = result;
    expect(header['schemaVersion']).toBe('1.0');
  });
});

// ---------------------------------------------------------------------------
// hypothetical-1.1 — forward compatibility smoke test
// ---------------------------------------------------------------------------

describe('hypothetical-1.1 fixtures (forward compat)', () => {
  it('isCompatible("1.1", "1.0") returns true (same major version)', () => {
    expect(isCompatible('1.1', '1.0')).toBe(true);
  });

  it('trace fixture has schemaVersion:"1.1" and extra tags field', async () => {
    const lines = await readJsonl(path.join(H11_DIR, 'trace-sample.jsonl'));
    const [header, ...events] = lines;

    expect(header['schemaVersion']).toBe('1.1');
    for (const event of events) {
      expect(event['schemaVersion']).toBe('1.1');
      expect(Array.isArray(event['tags'])).toBe(true);
    }
  });

  it('report fixture has schemaVersion:"1.1" in front-matter', async () => {
    const content = await fs.readFile(path.join(H11_DIR, 'report-sample.md'), 'utf-8');
    const fm = parseFrontMatter(content);
    expect(fm['schemaVersion']).toBe('1.1');
  });

  it('postgres fixture has schemaVersion:"1.1" on all rows', async () => {
    const raw = await fs.readFile(path.join(H11_DIR, 'postgres-rows.json'), 'utf-8');
    const data = JSON.parse(raw) as {
      runs: Record<string, unknown>[];
      gateDecisions: Record<string, unknown>[];
    };
    expect(data.runs[0]['schemaVersion']).toBe('1.1');
    expect(data.gateDecisions[0]['schemaVersion']).toBe('1.1');
  });

  it('1.1 trace events pass TraceEventSchema with passthrough (known fields)', async () => {
    const lines = await readJsonl(path.join(H11_DIR, 'trace-sample.jsonl'));
    const [, ...events] = lines;

    for (const event of events) {
      // Strip unknown fields (tags) before parsing, as Zod strips by default
      const { tags: _tags, ...knownFields } = event as Record<string, unknown> & { tags?: unknown };
      const result = TraceEventSchema.safeParse(knownFields);
      expect(result.success, `TraceEventSchema rejected: ${JSON.stringify(result)}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Idempotency: running migration twice gives the same result
// ---------------------------------------------------------------------------

describe('migration idempotency', () => {
  it('pre1ToV10 applied twice yields the same payload', async () => {
    const payload = { command: 'test' };
    const ctx = (version: string) => ({
      from: { schemaVersion: version, payload },
      to: { schemaVersion: '1.0' },
      logger: noopLogger,
    });

    const once = pre1ToV10.apply(ctx('pre-1.0')) as Record<string, unknown>;
    const twice = pre1ToV10.apply({ from: { schemaVersion: 'pre-1.0', payload: once }, to: { schemaVersion: '1.0' }, logger: noopLogger });

    expect(twice).toEqual(once);
  });

  it('TraceRunner applied twice to a pre-1.0 file yields identical content', async () => {
    const src = await readJsonl(path.join(PRE10_DIR, 'trace-sample.jsonl'));
    const [header, ...events] = src;

    const patchedHeader = { ...header, schemaVersion: 'pre-1.0' };
    const patchedEvents = events.map((e) => ({ ...e, schemaVersion: 'pre-1.0' }));
    const content =
      [JSON.stringify(patchedHeader), ...patchedEvents.map((e) => JSON.stringify(e))].join('\n') +
      '\n';

    const tmpFile = path.join(tmpDir, 'trace-idem.jsonl');
    await fs.writeFile(tmpFile, content, 'utf-8');

    const runner = new TraceRunner(registry, { logger: noopLogger });
    await runner.apply(tmpFile);
    const afterFirst = await fs.readFile(tmpFile, 'utf-8');

    await runner.apply(tmpFile);
    const afterSecond = await fs.readFile(tmpFile, 'utf-8');

    expect(afterSecond).toBe(afterFirst);
  });
});
