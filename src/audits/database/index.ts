import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../plugin/types.js';
import { AuditReportSchema } from '../types.js';
import { CURRENT_SCHEMA_VERSION } from '../../schemas/versioning.js';
import { mongodbAuditModule } from './mongodb/index.js';
import { postgresqlAuditModule } from './postgresql/index.js';
import { mysqlAuditModule } from './mysql/index.js';
import { countBySeverity, buildMarkdown } from '../shared.js';

const SUPPORTED_DATABASES = ['mongodb', 'postgresql', 'mysql'];

function getDatabase(stack: StackInfo): string | undefined {
  return stack.database;
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

  report(findings: AuditFinding[], ctx: AuditContext): AuditReport {
    const db = getDatabase(ctx.stack)?.toLowerCase() ?? '';

    if (db.includes('mongodb')) {
      return mongodbAuditModule.report(findings, ctx);
    }

    if (db.includes('postgresql')) {
      return postgresqlAuditModule.report(findings, ctx);
    }

    if (db.includes('mysql')) {
      return mysqlAuditModule.report(findings, ctx);
    }

    // Generic report for unknown databases
    const markdown = buildMarkdown('Database Audit Report', findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      auditId: 'audit:database',
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
