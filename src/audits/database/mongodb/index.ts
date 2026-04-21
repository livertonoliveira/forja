import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../../plugin/types.js';
import { AuditReportSchema } from '../../types.js';
import { detectMissingIndex } from './heuristics/missing-index.js';
import { detectUnboundedArray } from './heuristics/unbounded-array.js';
import { detectBsonLimit } from './heuristics/bson-limit.js';
import { detectLookupMissingIndex } from './heuristics/lookup-missing-index.js';
import { detectCollectionScan } from './heuristics/collection-scan.js';
import { detectWeakWriteConcern } from './heuristics/write-concern.js';
import { detectOplogRetention } from './heuristics/oplog-retention.js';
import { detectConnectionPool } from './heuristics/connection-pool.js';
import { detectSlowQuery } from './heuristics/slow-query.js';
import { detectWiredTigerCache } from './heuristics/wiredtiger-cache.js';
import { detectPushWithoutSlice } from './heuristics/push-without-slice.js';
import { detectInLarge } from './heuristics/in-large.js';
import { detectRegexUnanchored } from './heuristics/regex-unanchored.js';
import { detectUpsertNoUniqueIndex } from './heuristics/upsert-no-unique-index.js';
import { detectFulltextNoTextIndex } from './heuristics/fulltext-no-text-index.js';
import { countBySeverity, buildMarkdown } from '../../shared.js';

export const mongodbAuditModule: AuditModule = {
  id: 'audit:database:mongodb',

  detect(stack: StackInfo) {
    const db = stack.database;
    if (db?.toLowerCase().includes('mongodb')) {
      return { applicable: true };
    }
    return { applicable: false, reason: 'MongoDB not detected in stack' };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    const results = await Promise.all([
      detectMissingIndex(ctx),
      detectUnboundedArray(ctx),
      detectBsonLimit(ctx),
      detectLookupMissingIndex(ctx),
      detectCollectionScan(ctx),
      detectWeakWriteConcern(ctx),
      detectOplogRetention(ctx),
      detectConnectionPool(ctx),
      detectSlowQuery(ctx),
      detectWiredTigerCache(ctx),
      detectPushWithoutSlice(ctx),
      detectInLarge(ctx),
      detectRegexUnanchored(ctx),
      detectUpsertNoUniqueIndex(ctx),
      detectFulltextNoTextIndex(ctx),
    ]);
    return results.flat();
  },

  report(findings: AuditFinding[], ctx: AuditContext): AuditReport {
    const markdown = buildMarkdown('MongoDB Audit Report', findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: 'audit:database:mongodb',
      stackInfo: ctx.stack,
      startedAt: now,
      finishedAt: now,
      findings: findings.map((f, i) => ({
        schemaVersion: '1.0',
        id: `finding-${String(i + 1).padStart(3, '0')}`,
        severity: f.severity,
        title: f.title,
        category: f.category,
        description: f.description,
        ...(f.filePath ? { filePath: f.filePath } : {}),
        ...(f.line !== undefined ? { line: f.line } : {}),
      })),
      markdown,
      summary: {
        total: findings.length,
        bySeverity: countBySeverity(findings),
      },
    });

    return { markdown, json };
  },
};
