import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../plugin/types.js';
import { AuditReportSchema } from '../types.js';
import { CURRENT_SCHEMA_VERSION } from '../../schemas/versioning.js';
import { countBySeverity, buildMarkdown } from '../shared.js';
import { detectNPlusOne } from './heuristics/n-plus-one.js';
import { detectMissingCache } from './heuristics/missing-cache.js';
import { detectPessimisticLocks } from './heuristics/pessimistic-locks.js';
import { detectBlockingIO } from './heuristics/blocking-io.js';
import { detectMemoryGrowth } from './heuristics/memory-growth.js';
import { detectSecretLeaks } from './heuristics/secret-leaks.js';
import { detectMissingRequestTimeout } from './heuristics/request-timeout.js';

const SUPPORTED_FRAMEWORKS = ['nestjs', 'express', 'fastify', 'fastapi', 'rails'];

export const backendAuditModule: AuditModule = {
  id: 'audit:backend',

  detect(stack: StackInfo) {
    if (!stack.framework) {
      return { applicable: false, reason: 'No framework detected in stack' };
    }
    const fw = stack.framework.toLowerCase();
    const matched = SUPPORTED_FRAMEWORKS.some((s) => fw.includes(s));
    if (!matched) {
      return {
        applicable: false,
        reason: `Framework "${stack.framework}" is not supported. Supported: NestJS, Express, Fastify, FastAPI, Rails`,
      };
    }
    return { applicable: true };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    const results = await Promise.all([
      detectNPlusOne(ctx),
      detectMissingCache(ctx),
      detectPessimisticLocks(ctx),
      detectBlockingIO(ctx),
      detectMemoryGrowth(ctx),
      detectSecretLeaks(ctx),
      detectMissingRequestTimeout(ctx),
    ]);
    return results.flat();
  },

  report(findings: AuditFinding[], ctx: AuditContext): AuditReport {
    const markdown = buildMarkdown('Backend Audit Report', findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      auditId: 'audit:backend',
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
