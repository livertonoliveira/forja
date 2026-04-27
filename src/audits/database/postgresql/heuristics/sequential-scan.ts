import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const SELECT_STAR_PATTERN = /SELECT\s+\*/i;
const LIMIT_PATTERN = /LIMIT/i;

export async function detectSequentialScan(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!SELECT_STAR_PATTERN.test(line)) continue;
      const window = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n');
      if (LIMIT_PATTERN.test(window)) continue;
      findings.push({
        severity: 'high',
        title: 'SELECT * without LIMIT may cause sequential scan',
        category: 'database:postgresql:sequential-scan',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `\`SELECT *\` at line ${i + 1} without a \`LIMIT\` clause may cause a full sequential scan on large tables, ` +
          `fetching all columns and all rows into memory. Replace \`*\` with an explicit column list and add a ` +
          `\`LIMIT\` clause. Use \`EXPLAIN (ANALYZE, BUFFERS)\` to confirm index scans are used instead of Seq Scans.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
