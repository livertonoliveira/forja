import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../plugin/types.js';
import { AuditReportSchema } from '../types.js';
import { mongodbAuditModule } from './mongodb/index.js';
import { postgresqlAuditModule } from './postgresql/index.js';
import { mysqlAuditModule } from './mysql/index.js';
import { countBySeverity, buildMarkdown } from '../shared.js';

const SUPPORTED_DATABASES = ['mongodb', 'postgresql', 'mysql'];

// Stores the stack from the last run() call so report() can use it
let _lastStack: StackInfo = { language: 'typescript', runtime: 'node' };

function getDatabase(stack: StackInfo): string | undefined {
  return (stack as StackInfo & { database?: string }).database;
}

export const databaseAuditModule: AuditModule = {
  id: 'audit:database',

  detect(stack: StackInfo) {
    const db = getDatabase(stack);
    if (!db) {
      return { applicable: false, reason: 'No supported database detected in stack' };
    }
    const dbLower = db.toLowerCase();
    const matched = SUPPORTED_DATABASES.some((s) => dbLower.includes(s));
    if (!matched) {
      return {
        applicable: false,
        reason: `Database "${db}" is not supported. Supported: MongoDB, PostgreSQL, MySQL`,
      };
    }
    return { applicable: true };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    _lastStack = ctx.stack;
    const db = getDatabase(ctx.stack)?.toLowerCase() ?? '';

    if (db.includes('mongodb')) {
      return mongodbAuditModule.run(ctx);
    }

    if (db.includes('postgresql')) {
      return postgresqlAuditModule.run(ctx);
    }

    if (db.includes('mysql')) {
      return mysqlAuditModule.run(ctx);
    }

    return [];
  },

  report(findings: AuditFinding[]): AuditReport {
    const db = getDatabase(_lastStack)?.toLowerCase() ?? '';

    if (db.includes('mongodb')) {
      return mongodbAuditModule.report(findings);
    }

    if (db.includes('postgresql')) {
      return postgresqlAuditModule.report(findings);
    }

    if (db.includes('mysql')) {
      return mysqlAuditModule.report(findings);
    }

    // Generic report for unknown databases
    const markdown = buildMarkdown('Database Audit Report', findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: 'audit:database',
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
