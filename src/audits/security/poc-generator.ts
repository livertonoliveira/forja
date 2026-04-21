import type { AuditFinding } from '../../plugin/types.js';

const DISCLAIMER = `> DISCLAIMER: This PoC is for educational and authorized security testing purposes ONLY.
> Never run against systems you do not own or have explicit written permission to test.
> Unauthorized use is illegal and unethical.`;

function generateCurlPoc(finding: AuditFinding): string | null {
  if (!finding.exploitVector) return null;
  const vector = finding.exploitVector;
  const lines: string[] = [
    `## PoC: ${finding.title}`,
    '',
    `**CWE:** ${finding.cwe ?? 'N/A'}  |  **Severity:** ${finding.severity.toUpperCase()}`,
    finding.filePath ? `**File:** \`${finding.filePath}${finding.line ? `:${finding.line}` : ''}\`` : '',
    '',
    DISCLAIMER,
    '',
    '### Exploit Vector',
    '```',
    vector,
    '```',
    '',
    '### Remediation',
    finding.description,
    '',
  ];
  return lines.filter(l => l !== '').join('\n');
}

export function generatePocReport(findings: AuditFinding[]): string {
  const eligible = findings.filter(
    f => (f.severity === 'critical' || f.severity === 'high') && f.exploitVector,
  );
  if (eligible.length === 0) return '';

  const sections = eligible.map(generateCurlPoc).filter(Boolean) as string[];
  return [
    '# Security PoC Report',
    '',
    DISCLAIMER,
    '',
    `**Total PoCs generated:** ${sections.length}`,
    '',
    '---',
    '',
    sections.join('\n---\n\n'),
  ].join('\n');
}
