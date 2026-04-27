import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../../plugin/types.js';
import { AuditReportSchema } from '../../types.js';
import { CURRENT_SCHEMA_VERSION } from '../../../schemas/versioning.js';
import { detectMissingIndex } from './heuristics/missing-index.js';
import { detectUtf8Charset } from './heuristics/utf8-charset.js';
import { detectMyisamEngine } from './heuristics/myisam-engine.js';
import { detectInnodbBufferPool } from './heuristics/innodb-buffer-pool.js';
import { detectQueryCache } from './heuristics/query-cache.js';
import { detectForeignKeyMissing } from './heuristics/foreign-key-missing.js';
import { detectVarcharExcessiveLength } from './heuristics/varchar-excessive-length.js';
import { countBySeverity, buildMarkdown } from '../../shared.js';

export const mysqlAuditModule: AuditModule = {
  id: 'audit:database:mysql',

  detect(stack: StackInfo) {
    const db = stack.database;
    if (db?.toLowerCase().includes('mysql')) {
      return { applicable: true };
    }
    return { applicable: false, reason: 'MySQL not detected in stack' };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    const results = await Promise.all([
      detectMissingIndex(ctx),
      detectUtf8Charset(ctx),
      detectMyisamEngine(ctx),
      detectInnodbBufferPool(ctx),
      detectQueryCache(ctx),
      detectForeignKeyMissing(ctx),
      detectVarcharExcessiveLength(ctx),
    ]);
    return results.flat();
  },

  report(findings: AuditFinding[], ctx: AuditContext): AuditReport {
    const markdown = buildMarkdown('MySQL Audit Report', findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      auditId: 'audit:database:mysql',
      stackInfo: ctx.stack,
      startedAt: now,
      finishedAt: now,
      findings: findings.map((f, i) => ({
        schemaVersion: CURRENT_SCHEMA_VERSION,
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
