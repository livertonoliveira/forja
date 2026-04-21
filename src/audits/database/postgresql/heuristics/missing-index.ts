import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const QUERY_PATTERN = /\.(query|execute)\s*\(\s*['"`]?\s*SELECT\s+\*/i;
const WHERE_PATTERN = /WHERE/i;

export async function detectMissingIndex(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!QUERY_PATTERN.test(line)) continue;
      const window = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
      if (!WHERE_PATTERN.test(window)) continue;
      findings.push({
        severity: 'high',
        title: 'SELECT with WHERE clause may lack supporting index',
        category: 'database:postgresql:missing-index',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`.query()\` or \`.execute()\` call with a SELECT containing a WHERE clause was detected at line ${i + 1} ` +
          `without a comment indicating index usage. \`pg_stat_statements\` can reveal missing indexes by showing ` +
          `high total_time queries. Add explicit indexes on WHERE columns (e.g. \`CREATE INDEX ON table (column)\`) ` +
          `and verify with \`EXPLAIN (ANALYZE, BUFFERS)\` that index scans are used.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
