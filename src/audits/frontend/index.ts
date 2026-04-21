import type { AuditModule, AuditFinding, AuditReport, StackInfo, AuditContext } from '../../plugin/types.js';
import { AuditReportSchema } from '../types.js';
import { runNextjsAudit } from './nextjs/index.js';
import { runGenericFrontendAudit } from './generic/index.js';
import { countBySeverity } from './utils.js';

const SUPPORTED_FRAMEWORKS = [
  'nextjs', 'next.js', 'next',
  'vite', 'astro', 'nuxt', 'remix',
  'react', 'vue', 'angular', 'svelte',
];

function isNextJs(framework: string): boolean {
  const fw = framework.toLowerCase();
  return fw === 'nextjs' || fw === 'next.js' || fw === 'next';
}

function buildMarkdown(findings: AuditFinding[], framework: string): string {
  const bySeverity = countBySeverity(findings);
  const lines: string[] = [
    '# Frontend Audit Report',
    '',
    `**Framework:** ${framework}`,
    '',
    '## Summary',
  ];

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

export const frontendAuditModule: AuditModule = {
  id: 'audit:frontend',

  detect(stack: StackInfo) {
    if (!stack.framework) {
      return { applicable: false, reason: 'No frontend framework detected in stack' };
    }
    const fw = stack.framework.toLowerCase();
    const matched = SUPPORTED_FRAMEWORKS.some((s) => fw.includes(s));
    if (!matched) {
      return {
        applicable: false,
        reason: `Framework "${stack.framework}" is not a supported frontend framework. Supported: Next.js, Vite, Astro, Nuxt, Remix, React, Vue, Angular, Svelte`,
      };
    }
    return { applicable: true };
  },

  async run(ctx: AuditContext): Promise<AuditFinding[]> {
    const fw = ctx.stack.framework?.toLowerCase() ?? '';
    if (isNextJs(fw)) {
      return runNextjsAudit(ctx);
    }
    return runGenericFrontendAudit(ctx);
  },

  report(findings: AuditFinding[], ctx: AuditContext): AuditReport {
    const framework = ctx.stack.framework ?? 'unknown';
    const markdown = buildMarkdown(findings, framework);
    const now = new Date().toISOString();

    const json = AuditReportSchema.parse({
      schemaVersion: '1.0',
      auditId: 'audit:frontend',
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
