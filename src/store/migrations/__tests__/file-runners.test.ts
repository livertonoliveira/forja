import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { TraceRunner } from '../trace-runner.js';
import { ReportRunner } from '../report-runner.js';
import { addField } from '../primitives.js';
import { CURRENT_SCHEMA_VERSION } from '../../../schemas/versioning.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OLD_VERSION = '0.9';
const CURRENT_VERSION = CURRENT_SCHEMA_VERSION; // '1.0'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'file-runners-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function traceFilePath(name = 'trace.jsonl'): string {
  return path.join(tmpDir, name);
}

function reportFilePath(name = 'report.md'): string {
  return path.join(tmpDir, name);
}

/** Writes a JSONL trace file with the given header and event payloads. */
async function writeTraceFile(
  filePath: string,
  schemaVersion: string,
  events: Record<string, unknown>[] = [],
): Promise<void> {
  const header = JSON.stringify({ type: 'header', schemaVersion, runId: 'test-run' });
  const eventLines = events.map((payload) =>
    JSON.stringify({ type: 'event', schemaVersion, payload }),
  );
  const content = [header, ...eventLines].join('\n') + '\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

/** Writes a markdown report file with the given front-matter schemaVersion. */
async function writeReportFile(
  filePath: string,
  schemaVersion: string,
  body = '# Test Report\n\nBody content preserved.\n',
): Promise<void> {
  const frontMatter = `schemaVersion: "${schemaVersion}"\nrunId: "test-run"\ncreatedAt: "2026-01-01T00:00:00.000Z"`;
  const content = `---\n${frontMatter}\n---\n${body}`;
  await fs.writeFile(filePath, content, 'utf-8');
}

/** Reads a JSONL trace file and returns parsed lines. */
async function readTraceLines(filePath: string): Promise<Record<string, unknown>[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Reads a report file and returns its raw content. */
async function readReportContent(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

// ---------------------------------------------------------------------------
// Test migrations
// ---------------------------------------------------------------------------

/** Adds `newField: "default"` from OLD_VERSION → CURRENT_VERSION */
const testMigration = addField('newField', 'default', OLD_VERSION, CURRENT_VERSION);

// ---------------------------------------------------------------------------
// TraceRunner
// ---------------------------------------------------------------------------

describe('TraceRunner', () => {
  describe('apply() — already at current version', () => {
    it('returns filePath without writing when file is already at CURRENT_SCHEMA_VERSION', async () => {
      const filePath = traceFilePath();
      await writeTraceFile(filePath, CURRENT_VERSION, [{ id: '1' }]);

      const originalStat = await fs.stat(filePath);

      const runner = new TraceRunner([], { logger: noopLogger });
      const result = await runner.apply(filePath);

      const afterStat = await fs.stat(filePath);

      expect(result).toBe(filePath);
      // File modification time should not change
      expect(afterStat.mtimeMs).toBe(originalStat.mtimeMs);
    });
  });

  describe('apply() — dry-run', () => {
    it('does NOT modify the file on disk when dryRun is true', async () => {
      const filePath = traceFilePath();
      await writeTraceFile(filePath, OLD_VERSION, [{ id: '1' }]);

      const originalContent = await fs.readFile(filePath, 'utf-8');

      const runner = new TraceRunner([testMigration], { dryRun: true, logger: noopLogger });
      const result = await runner.apply(filePath);

      const afterContent = await fs.readFile(filePath, 'utf-8');

      expect(result).toBe(filePath);
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('apply() — actual migration', () => {
    it('updates the file on disk with migrated content', async () => {
      const filePath = traceFilePath();
      await writeTraceFile(filePath, OLD_VERSION, [{ id: '1' }, { id: '2' }]);

      const runner = new TraceRunner([testMigration], { logger: noopLogger });
      const result = await runner.apply(filePath);

      expect(result).toBe(filePath);

      const lines = await readTraceLines(filePath);

      // Header must have the new schemaVersion
      expect(lines[0]).toMatchObject({ type: 'header', schemaVersion: CURRENT_VERSION });

      // Each event line must have updated schemaVersion and migrated payload
      for (const line of lines.slice(1)) {
        expect(line['schemaVersion']).toBe(CURRENT_VERSION);
        const payload = line['payload'] as Record<string, unknown>;
        expect(payload).toHaveProperty('newField', 'default');
      }
    });

    it('preserves existing payload fields alongside the added field', async () => {
      const filePath = traceFilePath();
      await writeTraceFile(filePath, OLD_VERSION, [{ id: 'abc', value: 42 }]);

      const runner = new TraceRunner([testMigration], { logger: noopLogger });
      await runner.apply(filePath);

      const lines = await readTraceLines(filePath);
      const payload = lines[1]['payload'] as Record<string, unknown>;

      expect(payload['id']).toBe('abc');
      expect(payload['value']).toBe(42);
      expect(payload['newField']).toBe('default');
    });
  });

  describe('apply() — invalid file (no header)', () => {
    it('throws a clear error when the file has no valid JSON header', async () => {
      const filePath = traceFilePath();
      await fs.writeFile(filePath, 'not json at all\n', 'utf-8');

      const runner = new TraceRunner([], { logger: noopLogger });
      await expect(runner.apply(filePath)).rejects.toThrow(/invalid first line/);
    });

    it('throws when header is missing "type" or "schemaVersion"', async () => {
      const filePath = traceFilePath();
      await fs.writeFile(filePath, JSON.stringify({ type: 'event' }) + '\n', 'utf-8');

      const runner = new TraceRunner([], { logger: noopLogger });
      await expect(runner.apply(filePath)).rejects.toThrow(/missing a valid header/);
    });

    it('throws when file is empty', async () => {
      const filePath = traceFilePath();
      await fs.writeFile(filePath, '', 'utf-8');

      const runner = new TraceRunner([], { logger: noopLogger });
      await expect(runner.apply(filePath)).rejects.toThrow(/empty/);
    });
  });

  describe('apply() — from/to options', () => {
    it('uses explicit from/to versions overriding the header version', async () => {
      const filePath = traceFilePath();
      // Write file with a header that has OLD_VERSION, but force from=OLD_VERSION to=CURRENT_VERSION explicitly
      await writeTraceFile(filePath, OLD_VERSION, [{ id: '1' }]);

      const runner = new TraceRunner([testMigration], {
        from: OLD_VERSION,
        to: CURRENT_VERSION,
        logger: noopLogger,
      });
      const result = await runner.apply(filePath);

      expect(result).toBe(filePath);

      const lines = await readTraceLines(filePath);
      expect(lines[0]['schemaVersion']).toBe(CURRENT_VERSION);
      const payload = lines[1]['payload'] as Record<string, unknown>;
      expect(payload).toHaveProperty('newField', 'default');
    });

    it('skips migration when from === to (explicit versions)', async () => {
      const filePath = traceFilePath();
      await writeTraceFile(filePath, OLD_VERSION, [{ id: '1' }]);

      const originalContent = await fs.readFile(filePath, 'utf-8');

      const runner = new TraceRunner([testMigration], {
        from: OLD_VERSION,
        to: OLD_VERSION,
        logger: noopLogger,
      });
      await runner.apply(filePath);

      const afterContent = await fs.readFile(filePath, 'utf-8');
      expect(afterContent).toBe(originalContent);
    });
  });
});

// ---------------------------------------------------------------------------
// ReportRunner
// ---------------------------------------------------------------------------

describe('ReportRunner', () => {
  describe('apply() — already at version', () => {
    it('returns filePath without writing when file is at CURRENT_SCHEMA_VERSION', async () => {
      const filePath = reportFilePath();
      await writeReportFile(filePath, CURRENT_VERSION);

      const originalContent = await readReportContent(filePath);

      const runner = new ReportRunner([], { logger: noopLogger });
      const result = await runner.apply(filePath);

      const afterContent = await readReportContent(filePath);

      expect(result).toBe(filePath);
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('apply() — dry-run', () => {
    it('does NOT modify the file on disk when dryRun is true', async () => {
      const filePath = reportFilePath();
      await writeReportFile(filePath, OLD_VERSION);

      const originalContent = await readReportContent(filePath);

      const runner = new ReportRunner([testMigration], { dryRun: true, logger: noopLogger });
      const result = await runner.apply(filePath);

      const afterContent = await readReportContent(filePath);

      expect(result).toBe(filePath);
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('apply() — actual migration', () => {
    it('updates front-matter schemaVersion and adds new field', async () => {
      const filePath = reportFilePath();
      await writeReportFile(filePath, OLD_VERSION);

      const runner = new ReportRunner([testMigration], { logger: noopLogger });
      const result = await runner.apply(filePath);

      expect(result).toBe(filePath);

      const content = await readReportContent(filePath);

      expect(content).toContain(`schemaVersion: "${CURRENT_VERSION}"`);
      expect(content).toContain('newField: "default"');
    });

    it('preserves existing front-matter fields', async () => {
      const filePath = reportFilePath();
      await writeReportFile(filePath, OLD_VERSION);

      const runner = new ReportRunner([testMigration], { logger: noopLogger });
      await runner.apply(filePath);

      const content = await readReportContent(filePath);

      expect(content).toContain('runId: "test-run"');
      expect(content).toContain('createdAt: "2026-01-01T00:00:00.000Z"');
    });
  });

  describe('apply() — from/to options', () => {
    it('uses explicit from/to versions overriding front-matter schemaVersion', async () => {
      const filePath = reportFilePath();
      await writeReportFile(filePath, OLD_VERSION);

      const runner = new ReportRunner([testMigration], {
        from: OLD_VERSION,
        to: CURRENT_VERSION,
        logger: noopLogger,
      });
      await runner.apply(filePath);

      const content = await readReportContent(filePath);
      expect(content).toContain(`schemaVersion: "${CURRENT_VERSION}"`);
    });

    it('skips migration when from === to (explicit versions)', async () => {
      const filePath = reportFilePath();
      await writeReportFile(filePath, OLD_VERSION);

      const originalContent = await readReportContent(filePath);

      const runner = new ReportRunner([testMigration], {
        from: OLD_VERSION,
        to: OLD_VERSION,
        logger: noopLogger,
      });
      await runner.apply(filePath);

      const afterContent = await readReportContent(filePath);
      expect(afterContent).toBe(originalContent);
    });
  });

  describe('apply() — body preservation', () => {
    it('preserves the markdown body byte-for-byte after migration', async () => {
      const body =
        '# Test Report\n\nBody content preserved.\n\n## Section\n\nWith multiple paragraphs.\n';
      const filePath = reportFilePath();
      await writeReportFile(filePath, OLD_VERSION, body);

      const runner = new ReportRunner([testMigration], { logger: noopLogger });
      await runner.apply(filePath);

      const content = await readReportContent(filePath);

      // The body comes after the closing ---\n
      const bodyStart = content.indexOf('---\n', content.indexOf('---\n') + 4) + 4;
      const migratedBody = content.slice(bodyStart);

      expect(migratedBody).toBe(body);
    });

    it('body containing "---" separators is handled correctly', async () => {
      const body = '# Title\n\nSome text with --- horizontal rule inside.\n\n## More\n\nContent.\n';
      const filePath = reportFilePath();
      await writeReportFile(filePath, OLD_VERSION, body);

      const runner = new ReportRunner([testMigration], { logger: noopLogger });
      await runner.apply(filePath);

      const content = await readReportContent(filePath);

      // Ensure the body content including the embedded --- is still present
      expect(content).toContain('--- horizontal rule inside');
    });
  });
});
