import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { detectMissingIndex } from '../heuristics/missing-index.js';
import { detectUtf8Charset } from '../heuristics/utf8-charset.js';
import { detectMyisamEngine } from '../heuristics/myisam-engine.js';
import { detectInnodbBufferPool } from '../heuristics/innodb-buffer-pool.js';
import { detectQueryCache } from '../heuristics/query-cache.js';
import { detectForeignKeyMissing } from '../heuristics/foreign-key-missing.js';
import { detectVarcharExcessiveLength } from '../heuristics/varchar-excessive-length.js';

// The test file lives at src/audits/database/mysql/__tests__/heuristics.test.ts
// Going up 5 levels (__tests__ → mysql → database → audits → src → project root)
// then into tests/fixtures/audits/database/mysql
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../../../tests/fixtures/audits/database/mysql');

function makeCtx(cwd: string) {
  return {
    cwd,
    stack: { language: 'typescript', runtime: 'node', database: 'MySQL' },
    config: {},
    abortSignal: new AbortController().signal,
  };
}

// ---------------------------------------------------------------------------
// detectMissingIndex
// Triggers: positive.ts — pool.query(`SELECT * FROM users WHERE email = ?`) without USE INDEX
// No trigger: negative.ts — includes USE INDEX (idx_email) in the query string
// ---------------------------------------------------------------------------
describe('detectMissingIndex', () => {
  it('detects SELECT+WHERE without index hint in positive fixture', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('positive'));
    expect(found).toBe(true);
  });

  it('does not flag negative fixture (has USE INDEX hint)', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces high severity findings', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:mysql:missing-index'));
  });
});

// ---------------------------------------------------------------------------
// detectUtf8Charset
// Triggers: positive.ts — CHARSET=utf8 in DDL
// No trigger: negative.ts — CHARSET=utf8mb4 in DDL
// ---------------------------------------------------------------------------
describe('detectUtf8Charset', () => {
  it('detects CHARSET=utf8 in positive fixture', async () => {
    const findings = await detectUtf8Charset(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('positive'));
    expect(found).toBe(true);
  });

  it('does not flag negative fixture (uses utf8mb4)', async () => {
    const findings = await detectUtf8Charset(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces high severity findings', async () => {
    const findings = await detectUtf8Charset(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectUtf8Charset(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:mysql:utf8-charset'));
  });
});

// ---------------------------------------------------------------------------
// detectMyisamEngine
// Triggers: positive.ts — ENGINE=MyISAM in DDL
// No trigger: negative.ts — ENGINE=InnoDB in DDL
// ---------------------------------------------------------------------------
describe('detectMyisamEngine', () => {
  it('detects ENGINE=MyISAM in positive fixture', async () => {
    const findings = await detectMyisamEngine(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('positive'));
    expect(found).toBe(true);
  });

  it('does not flag negative fixture (uses InnoDB)', async () => {
    const findings = await detectMyisamEngine(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces high severity findings', async () => {
    const findings = await detectMyisamEngine(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectMyisamEngine(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:mysql:myisam-engine'));
  });
});

// ---------------------------------------------------------------------------
// detectInnodbBufferPool
// Triggers: positive.ts — innodb_buffer_pool_size = 32M (below 128MB)
// No trigger: negative.ts — innodb_buffer_pool_size = 2G (above 128MB)
// ---------------------------------------------------------------------------
describe('detectInnodbBufferPool', () => {
  it('detects small innodb_buffer_pool_size in positive fixture', async () => {
    const findings = await detectInnodbBufferPool(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('positive'));
    expect(found).toBe(true);
  });

  it('does not flag negative fixture (2G buffer pool)', async () => {
    const findings = await detectInnodbBufferPool(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectInnodbBufferPool(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectInnodbBufferPool(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:mysql:innodb-buffer-pool'));
  });
});

// ---------------------------------------------------------------------------
// detectQueryCache
// Triggers: positive.ts — query_cache_type = 1 and query_cache_size = 67108864
// No trigger: negative.ts — query_cache_type = 0 and query_cache_size = 0
// ---------------------------------------------------------------------------
describe('detectQueryCache', () => {
  it('detects enabled query cache in positive fixture', async () => {
    const findings = await detectQueryCache(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('positive'));
    expect(found).toBe(true);
  });

  it('does not flag negative fixture (query cache disabled)', async () => {
    const findings = await detectQueryCache(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectQueryCache(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectQueryCache(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:mysql:query-cache'));
  });
});

// ---------------------------------------------------------------------------
// detectForeignKeyMissing
// Triggers: positive.ts — user_id INT and org_id INT in CREATE TABLE without FOREIGN KEY
// No trigger: negative.ts — CREATE TABLE has FOREIGN KEY (org_id) REFERENCES orgs(id)
// ---------------------------------------------------------------------------
describe('detectForeignKeyMissing', () => {
  it('detects FK-convention columns without FOREIGN KEY in positive fixture', async () => {
    const findings = await detectForeignKeyMissing(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('positive'));
    expect(found).toBe(true);
  });

  it('does not flag negative fixture (has FOREIGN KEY constraint)', async () => {
    const findings = await detectForeignKeyMissing(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectForeignKeyMissing(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectForeignKeyMissing(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:mysql:foreign-key-missing'));
  });
});

// ---------------------------------------------------------------------------
// detectVarcharExcessiveLength
// Triggers: positive.ts — VARCHAR(2000) for name and email columns
// No trigger: negative.ts — VARCHAR(255) for name and email columns
// ---------------------------------------------------------------------------
describe('detectVarcharExcessiveLength', () => {
  it('detects VARCHAR(2000) in positive fixture', async () => {
    const findings = await detectVarcharExcessiveLength(makeCtx(FIXTURES_DIR));
    const found = findings.some(f => f.filePath?.includes('positive'));
    expect(found).toBe(true);
  });

  it('does not flag negative fixture (VARCHAR(255) is within limit)', async () => {
    const findings = await detectVarcharExcessiveLength(makeCtx(FIXTURES_DIR));
    const hasNegative = findings.some(f => f.filePath?.includes('negative'));
    expect(hasNegative).toBe(false);
  });

  it('produces low severity findings', async () => {
    const findings = await detectVarcharExcessiveLength(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('low'));
  });

  it('produces correct category', async () => {
    const findings = await detectVarcharExcessiveLength(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:mysql:varchar-excessive-length'));
  });
});
