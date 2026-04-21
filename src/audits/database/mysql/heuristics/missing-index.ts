import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const QUERY_PATTERN = /\.(query|execute)\s*\(\s*['"`]/i;
const SELECT_PATTERN = /\bSELECT\b/i;
const WHERE_PATTERN = /\bWHERE\b/i;
const INDEX_HINT_PATTERN = /USE\s+INDEX|FORCE\s+INDEX/i;

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
      // Check surrounding context (5 lines forward) for SELECT+WHERE
      const window = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
      if (!SELECT_PATTERN.test(window) || !WHERE_PATTERN.test(window)) continue;
      // Check surrounding 5 lines for USE INDEX / FORCE INDEX hint
      const hintWindow = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5)).join('\n');
      if (INDEX_HINT_PATTERN.test(hintWindow)) continue;
      findings.push({
        severity: 'high',
        title: 'SELECT with WHERE clause may cause full table scan',
        category: 'database:mysql:missing-index',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`.query()\` or \`.execute()\` call with a SELECT containing a WHERE clause was detected at line ${i + 1} ` +
          `without a USE INDEX or FORCE INDEX hint. Without supporting indexes this query may perform a full table scan. ` +
          `Use EXPLAIN to check the query plan and add indexes on filter columns. ` +
          `MySQL supports USE INDEX (idx_name) and FORCE INDEX (idx_name) hints to control index selection.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
