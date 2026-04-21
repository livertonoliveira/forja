import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../plugin/types.js';
import { AuditReportSchema } from '../types.js';
import { countBySeverity, buildMarkdown } from '../shared.js';
import { generatePocReport } from './poc-generator.js';
import { detectBrokenAccessControl } from './owasp/a01-broken-access-control.js';
import { detectCryptographicFailures } from './owasp/a02-cryptographic-failures.js';
import { detectInjection } from './owasp/a03-injection.js';
import { detectInsecureDesign } from './owasp/a04-insecure-design.js';
import { detectSecurityMisconfiguration } from './owasp/a05-security-misconfiguration.js';
import { detectVulnerableComponents } from './owasp/a06-vulnerable-components.js';
import { detectAuthFailures } from './owasp/a07-auth-failures.js';
import { detectDataIntegrityFailures } from './owasp/a08-data-integrity-failures.js';
import { detectLoggingMonitoring } from './owasp/a09-logging-monitoring.js';
import { detectSSRF } from './owasp/a10-ssrf.js';

export const securityAuditModule: AuditModule = {
  id: 'audit:security',

  detect(_stack: StackInfo) {
    return { applicable: true };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    const results = await Promise.all([
      detectBrokenAccessControl(ctx),
      detectCryptographicFailures(ctx),
      detectInjection(ctx),
      detectInsecureDesign(ctx),
      detectSecurityMisconfiguration(ctx),
      detectVulnerableComponents(ctx),
      detectAuthFailures(ctx),
      detectDataIntegrityFailures(ctx),
      detectLoggingMonitoring(ctx),
      detectSSRF(ctx),
    ]);
    return results.flat();
  },

  report(findings: AuditFinding[], ctx: AuditContext): AuditReport {
    let markdown = buildMarkdown('Security Audit Report — OWASP Top 10', findings);
    if (ctx.config['generatePocs'] === true) {
      const pocReport = generatePocReport(findings);
      if (pocReport) markdown += `\n\n---\n\n${pocReport}`;
    }
    const now = new Date().toISOString();
    const json = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: 'audit:security',
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
        ...(f.cwe ? { cwe: f.cwe } : {}),
        ...(f.exploitVector ? { exploitVector: f.exploitVector } : {}),
      })),
      markdown,
      summary: { total: findings.length, bySeverity: countBySeverity(findings) },
    });
    return { markdown, json };
  },
};
