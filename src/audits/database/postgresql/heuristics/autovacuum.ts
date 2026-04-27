import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const AUTOVACUUM_OFF_PATTERN = /autovacuum\s*=\s*off/i;
const AUTOVACUUM_SCALE_PATTERN = /autovacuum_vacuum_scale_factor\s*=\s*([\d.]+)/i;

export async function detectAutovacuum(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const srcDir = join(ctx.cwd, 'src');
  let files: string[];
  try {
    files = collectFiles(srcDir, ctx.abortSignal);
  } catch {
    return [];
  }
  const findings: AuditFinding[] = [];
  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      if (AUTOVACUUM_OFF_PATTERN.test(line)) {
        findings.push({
          severity: 'high',
          title: 'autovacuum disabled — table bloat will accumulate',
          category: 'database:postgresql:autovacuum',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `\`autovacuum = off\` detected at line ${i + 1}. Disabling autovacuum prevents PostgreSQL from ` +
            `reclaiming dead tuple space, causing table and index bloat over time. This leads to degraded query ` +
            `performance and increased disk usage. Keep autovacuum enabled and tune \`autovacuum_vacuum_cost_delay\` ` +
            `and \`autovacuum_vacuum_scale_factor\` instead of disabling it entirely.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
        continue;
      }
      const scaleMatch = AUTOVACUUM_SCALE_PATTERN.exec(line);
      if (scaleMatch && parseFloat(scaleMatch[1]) > 0.5) {
        findings.push({
          severity: 'high',
          title: 'autovacuum_vacuum_scale_factor is set too high',
          category: 'database:postgresql:autovacuum',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `\`autovacuum_vacuum_scale_factor\` > 0.5 detected at line ${i + 1}. A high scale factor means autovacuum ` +
            `only triggers when more than 50% of the table consists of dead tuples, causing severe bloat on large tables. ` +
            `For tables with millions of rows, set a low scale factor (e.g. 0.01) combined with \`autovacuum_vacuum_threshold\` ` +
            `to ensure timely vacuuming.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
