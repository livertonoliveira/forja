import type { AuditFinding } from '../plugin/types.js';
import type { AuditRunResult } from './runner.js';

const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export interface ConsolidatedReport {
  markdown: string;
  json: ConsolidatedReportJson;
}

export interface ConsolidatedReportJson {
  schemaVersion: '1.0';
  consolidatedAt: string;
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    moduleCount: number;
    passedCount: number;
    failedCount: number;
  };
  top10Findings: Array<{ moduleId: string; finding: AuditFinding }>;
  modules: Array<{
    moduleId: string;
    status: AuditRunResult['status'];
    findingCount: number;
    bySeverity: Record<string, number>;
    error?: string;
  }>;
}

export function consolidate(results: AuditRunResult[]): ConsolidatedReport {
  const allFindings: Array<{ moduleId: string; finding: AuditFinding }> = [];
  const totalBySeverity: Record<string, number> = {};

  for (const result of results) {
    for (const finding of result.findings) {
      allFindings.push({ moduleId: result.moduleId, finding });
    }
    for (const [sev, count] of Object.entries(result.bySeverity)) {
      totalBySeverity[sev] = (totalBySeverity[sev] ?? 0) + count;
    }
  }

  allFindings.sort(
    (a, b) =>
      (SEVERITY_ORDER[b.finding.severity] ?? 0) - (SEVERITY_ORDER[a.finding.severity] ?? 0),
  );

  const top10Findings = allFindings.slice(0, 10);
  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.length - passedCount;
  const consolidatedAt = new Date().toISOString();

  const modules = results.map((r) => ({
    moduleId: r.moduleId,
    status: r.status,
    findingCount: r.findings.length,
    bySeverity: r.bySeverity,
    ...(r.error !== undefined ? { error: r.error } : {}),
  }));

  const markdown = buildMarkdown(results, totalBySeverity, top10Findings, modules, allFindings.length);

  const json: ConsolidatedReportJson = {
    schemaVersion: '1.0',
    consolidatedAt,
    summary: {
      total: allFindings.length,
      bySeverity: totalBySeverity,
      moduleCount: results.length,
      passedCount,
      failedCount,
    },
    top10Findings,
    modules,
  };

  return { markdown, json };
}

function buildMarkdown(
  results: AuditRunResult[],
  bySeverity: Record<string, number>,
  top10: Array<{ moduleId: string; finding: AuditFinding }>,
  modules: ConsolidatedReportJson['modules'],
  total: number,
): string {
  const lines: string[] = ['# Consolidated Audit Report', ''];

  lines.push('## Summary', '');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total findings | ${total} |`);
  lines.push(`| Modules run | ${results.length} |`);
  lines.push(`| Passed | ${modules.filter((m) => m.status === 'passed').length} |`);
  lines.push(`| Failed / Timed out | ${modules.filter((m) => m.status !== 'passed').length} |`);
  for (const sev of ['critical', 'high', 'medium', 'low']) {
    if ((bySeverity[sev] ?? 0) > 0) {
      lines.push(`| ${sev.charAt(0).toUpperCase() + sev.slice(1)} | ${bySeverity[sev]} |`);
    }
  }

  lines.push('', '## Module Results', '');
  lines.push('| Module | Status | Findings | Critical | High | Medium | Low | Error |');
  lines.push('|--------|--------|----------|----------|------|--------|-----|-------|');
  for (const m of modules) {
    const c = m.bySeverity['critical'] ?? 0;
    const h = m.bySeverity['high'] ?? 0;
    const med = m.bySeverity['medium'] ?? 0;
    const l = m.bySeverity['low'] ?? 0;
    lines.push(
      `| ${m.moduleId} | ${m.status} | ${m.findingCount} | ${c} | ${h} | ${med} | ${l} | ${m.error ?? ''} |`,
    );
  }

  lines.push('', '## Top 10 Findings', '');
  if (top10.length === 0) {
    lines.push('No findings detected.');
  } else {
    for (const { moduleId, finding } of top10) {
      lines.push(`### [${finding.severity.toUpperCase()}] ${finding.title}`);
      lines.push(`- **Module:** ${moduleId}`);
      lines.push(`- **Category:** ${finding.category}`);
      if (finding.filePath) {
        lines.push(`- **File:** ${finding.filePath}${finding.line !== undefined ? `:${finding.line}` : ''}`);
      }
      lines.push(`- **Description:** ${finding.description}`);
      lines.push('');
    }
  }

  lines.push('## Individual Reports', '');
  for (const result of results) {
    if (result.report) {
      lines.push(`<details><summary>${result.moduleId}</summary>`, '');
      lines.push(result.report.markdown);
      lines.push('', '</details>', '');
    } else {
      lines.push(`### ${result.moduleId}`, '');
      lines.push(`Status: ${result.status}${result.error ? ` — ${result.error}` : ''}`, '');
    }
  }

  return lines.join('\n');
}
