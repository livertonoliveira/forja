import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { validateCwd } from '../../backend/utils.js';

interface NpmAuditReport {
  vulnerabilities?: Record<string, { severity: string; via: unknown[] }>;
  metadata?: { vulnerabilities: Record<string, number> };
}

export async function detectVulnerableComponents(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  if (ctx.abortSignal.aborted) return [];
  const pkgPath = join(ctx.cwd, 'package.json');
  if (!existsSync(pkgPath)) return [];

  let auditOutput: string;
  try {
    auditOutput = execSync('npm audit --json 2>/dev/null', { cwd: ctx.cwd, timeout: 30000, encoding: 'utf8' });
  } catch (err: unknown) {
    auditOutput = (err as { stdout?: string }).stdout ?? '';
  }

  if (!auditOutput.trim()) return [];

  let report: NpmAuditReport;
  try { report = JSON.parse(auditOutput); } catch { return []; }

  const findings: AuditFinding[] = [];
  const vulns = report.vulnerabilities ?? {};
  for (const [pkgName, info] of Object.entries(vulns)) {
    if (ctx.abortSignal.aborted) break;
    const sev = info.severity as 'critical' | 'high' | 'medium' | 'low';
    if (!['critical', 'high', 'medium', 'low'].includes(sev)) continue;
    findings.push({
      severity: sev,
      title: `Vulnerable dependency: ${pkgName} (${sev})`,
      category: 'security:owasp:a06',
      description: `npm audit reports a ${sev}-severity vulnerability in "${pkgName}". Run "npm audit fix" to apply available patches, or update to a non-vulnerable version. Vulnerable third-party components are a common entry point for supply-chain attacks.`,
      cwe: 'CWE-1395',
    });
  }
  return findings;
}
