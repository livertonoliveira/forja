import type { AuditFinding } from '../plugin/types.js';

export function countBySeverity(findings: AuditFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

export function buildMarkdown(title: string, findings: AuditFinding[]): string {
  const bySeverity = countBySeverity(findings);
  const lines: string[] = [`# ${title}`, '', '## Summary'];
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
