import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../plugin/types.js';
import { AuditReportSchema } from '../types.js';
import { detectNPlusOne } from './heuristics/n-plus-one.js';
import { detectMissingCache } from './heuristics/missing-cache.js';
import { detectPessimisticLocks } from './heuristics/pessimistic-locks.js';

const SUPPORTED_FRAMEWORKS = ['nestjs', 'express', 'fastify', 'fastapi', 'rails'];

// Stores the stack from the last run() call so report() can use it
let _lastStack: StackInfo = { language: 'typescript', runtime: 'node' };

function countBySeverity(findings: AuditFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

function buildMarkdown(findings: AuditFinding[]): string {
  const bySeverity = countBySeverity(findings);
  const lines: string[] = ['# Backend Audit Report', '', '## Summary'];

  lines.push(`- Total: ${findings.length}`);
  for (const sev of ['critical', 'high', 'medium', 'low'] as const) {
    if ((bySeverity[sev] ?? 0) > 0) {
      lines.push(`- ${sev.charAt(0).toUpperCase() + sev.slice(1)}: ${bySeverity[sev]}`);
    }
  }

  lines.push('', '## Findings', '');

  if (findings.length === 0) {
    lines.push('No findings detected.');
  } else {
    for (const f of findings) {
      lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
      lines.push(`- **Category:** ${f.category}`);
      if (f.filePath) {
        lines.push(`- **File:** ${f.filePath}${f.line !== undefined ? `:${f.line}` : ''}`);
      }
      lines.push(`- **Description:** ${f.description}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

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
    _lastStack = ctx.stack;
    const [a, b, c] = await Promise.all([
      detectNPlusOne(ctx),
      detectMissingCache(ctx),
      detectPessimisticLocks(ctx),
    ]);
    return [...a, ...b, ...c];
  },

  report(findings: AuditFinding[]): AuditReport {
    const markdown = buildMarkdown(findings);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: 'audit:backend',
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
