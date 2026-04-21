import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../../plugin/types.js';
import { AuditReportSchema } from '../../types.js';
import { detectMissingIndex } from './heuristics/missing-index.js';
import { detectSequentialScan } from './heuristics/sequential-scan.js';
import { detectForUpdateNoTimeout } from './heuristics/for-update-no-timeout.js';
import { detectAutovacuum } from './heuristics/autovacuum.js';
import { detectConnectionPool } from './heuristics/connection-pool.js';
import { detectTransactionWrap } from './heuristics/transaction-wrap.js';
import { detectTextNoLength } from './heuristics/text-no-length.js';
import { detectJsonVsJsonb } from './heuristics/json-vs-jsonb.js';
import { detectTriggerLargeTable } from './heuristics/trigger-large-table.js';
import { detectDeferrableConstraint } from './heuristics/deferrable-constraint.js';
import { countBySeverity, buildMarkdown } from '../../shared.js';

// Stores the stack from the last run() call so report() can use it
let _lastStack: StackInfo = { language: 'typescript', runtime: 'node' };

export const postgresqlAuditModule: AuditModule = {
  id: 'audit:database:postgresql',

  detect(stack: StackInfo) {
    const db = (stack as StackInfo & { database?: string }).database;
    if (db?.toLowerCase().includes('postgresql')) {
      return { applicable: true };
    }
    return { applicable: false, reason: 'PostgreSQL not detected in stack' };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    _lastStack = ctx.stack;
    const results = await Promise.all([
      detectMissingIndex(ctx),
      detectSequentialScan(ctx),
      detectForUpdateNoTimeout(ctx),
      detectAutovacuum(ctx),
      detectConnectionPool(ctx),
      detectTransactionWrap(ctx),
      detectTextNoLength(ctx),
      detectJsonVsJsonb(ctx),
      detectTriggerLargeTable(ctx),
      detectDeferrableConstraint(ctx),
    ]);
    return results.flat();
  },

  report(findings: AuditFinding[]): AuditReport {
    const markdown = buildMarkdown('PostgreSQL Audit Report', findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: 'audit:database:postgresql',
      stackInfo: _lastStack,
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
