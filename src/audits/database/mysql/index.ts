import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../../plugin/types.js';
import { AuditReportSchema } from '../../types.js';
import { detectMissingIndex } from './heuristics/missing-index.js';
import { detectUtf8Charset } from './heuristics/utf8-charset.js';
import { detectMyisamEngine } from './heuristics/myisam-engine.js';
import { detectInnodbBufferPool } from './heuristics/innodb-buffer-pool.js';
import { detectQueryCache } from './heuristics/query-cache.js';
import { detectForeignKeyMissing } from './heuristics/foreign-key-missing.js';
import { detectVarcharExcessiveLength } from './heuristics/varchar-excessive-length.js';
import { countBySeverity, buildMarkdown } from '../../shared.js';

// Stores the stack from the last run() call so report() can use it
let _lastStack: StackInfo = { language: 'typescript', runtime: 'node' };

export const mysqlAuditModule: AuditModule = {
  id: 'audit:database:mysql',

  detect(stack: StackInfo) {
    const db = (stack as StackInfo & { database?: string }).database;
    if (db?.toLowerCase().includes('mysql')) {
      return { applicable: true };
    }
    return { applicable: false, reason: 'MySQL not detected in stack' };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    _lastStack = ctx.stack;
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

  report(findings: AuditFinding[]): AuditReport {
    const markdown = buildMarkdown('MySQL Audit Report', findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: 'audit:database:mysql',
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
