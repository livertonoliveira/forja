import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { detectMissingIndex } from '../heuristics/missing-index.js';
import { detectSequentialScan } from '../heuristics/sequential-scan.js';
import { detectForUpdateNoTimeout } from '../heuristics/for-update-no-timeout.js';
import { detectAutovacuum } from '../heuristics/autovacuum.js';
import { detectConnectionPool } from '../heuristics/connection-pool.js';
import { detectTransactionWrap } from '../heuristics/transaction-wrap.js';
import { detectTextNoLength } from '../heuristics/text-no-length.js';
import { detectJsonVsJsonb } from '../heuristics/json-vs-jsonb.js';
import { detectTriggerLargeTable } from '../heuristics/trigger-large-table.js';
import { detectDeferrableConstraint } from '../heuristics/deferrable-constraint.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../../../../tests/fixtures/audits/database/postgresql');

function makeCtx(cwd: string) {
  return {
    cwd,
    stack: { language: 'typescript', runtime: 'node', database: 'postgresql' },
    config: {},
    abortSignal: new AbortController().signal,
  };
}

describe('detectMissingIndex', () => {
  it('detects missing index in positive fixture', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces high severity findings', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectMissingIndex(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:missing-index'));
  });
});

describe('detectSequentialScan', () => {
  it('detects sequential scan risk in positive fixture', async () => {
    const findings = await detectSequentialScan(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectSequentialScan(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces high severity findings', async () => {
    const findings = await detectSequentialScan(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectSequentialScan(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:sequential-scan'));
  });
});

describe('detectForUpdateNoTimeout', () => {
  it('detects FOR UPDATE without timeout in positive fixture', async () => {
    const findings = await detectForUpdateNoTimeout(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectForUpdateNoTimeout(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces high severity findings', async () => {
    const findings = await detectForUpdateNoTimeout(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectForUpdateNoTimeout(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:for-update-no-timeout'));
  });
});

describe('detectAutovacuum', () => {
  it('detects autovacuum disabled in positive fixture', async () => {
    const findings = await detectAutovacuum(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectAutovacuum(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces high severity findings', async () => {
    const findings = await detectAutovacuum(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('high'));
  });

  it('produces correct category', async () => {
    const findings = await detectAutovacuum(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:autovacuum'));
  });
});

describe('detectConnectionPool', () => {
  it('detects pool without max in positive fixture', async () => {
    const findings = await detectConnectionPool(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectConnectionPool(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectConnectionPool(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectConnectionPool(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:connection-pool'));
  });
});

describe('detectTransactionWrap', () => {
  it('detects multi-statement without transaction in positive fixture', async () => {
    const findings = await detectTransactionWrap(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectTransactionWrap(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectTransactionWrap(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectTransactionWrap(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:transaction-wrap'));
  });
});

describe('detectTextNoLength', () => {
  it('detects TEXT columns in positive fixture', async () => {
    const findings = await detectTextNoLength(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectTextNoLength(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces low severity findings', async () => {
    const findings = await detectTextNoLength(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('low'));
  });

  it('produces correct category', async () => {
    const findings = await detectTextNoLength(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:text-no-length'));
  });
});

describe('detectJsonVsJsonb', () => {
  it('detects JSON column in positive fixture', async () => {
    const findings = await detectJsonVsJsonb(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectJsonVsJsonb(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectJsonVsJsonb(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectJsonVsJsonb(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:json-vs-jsonb'));
  });
});

describe('detectTriggerLargeTable', () => {
  it('detects trigger without WHEN in positive fixture', async () => {
    const findings = await detectTriggerLargeTable(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectTriggerLargeTable(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces medium severity findings', async () => {
    const findings = await detectTriggerLargeTable(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('medium'));
  });

  it('produces correct category', async () => {
    const findings = await detectTriggerLargeTable(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:trigger-large-table'));
  });
});

describe('detectDeferrableConstraint', () => {
  it('detects FK without DEFERRABLE in positive fixture', async () => {
    const findings = await detectDeferrableConstraint(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('positive'))).toBe(true);
  });

  it('does not flag negative fixture', async () => {
    const findings = await detectDeferrableConstraint(makeCtx(FIXTURES_DIR));
    expect(findings.some(f => f.filePath?.includes('negative'))).toBe(false);
  });

  it('produces low severity findings', async () => {
    const findings = await detectDeferrableConstraint(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.severity).toBe('low'));
  });

  it('produces correct category', async () => {
    const findings = await detectDeferrableConstraint(makeCtx(FIXTURES_DIR));
    findings.forEach(f => expect(f.category).toBe('database:postgresql:deferrable-constraint'));
  });
});
