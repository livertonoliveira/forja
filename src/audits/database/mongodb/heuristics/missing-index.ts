import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const _QUERY_PATTERN = /\.(find|findOne|findMany)\s*\(\s*\{/g;
const HINT_PATTERN = /\.hint\s*\(/;

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
      // Match .find({, .findOne({, .findMany({ — non-empty query object
      if (!/\.(find|findOne|findMany)\s*\(\s*\{/.test(line)) continue;
      // Skip empty query objects: .find({}) or .find({ }) immediately closed
      if (/\.(find|findOne|findMany)\s*\(\s*\{\s*\}/.test(line)) continue;
      // Check surrounding context (20 lines) for .hint(
      const window = lines.slice(Math.max(0, i - 5), i + 20).join('\n');
      if (HINT_PATTERN.test(window)) continue;
      findings.push({
        severity: 'high',
        title: 'Query without explicit index hint',
        category: 'database:mongodb:missing-index',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`.find\`, \`.findOne\`, or \`.findMany\` call with field selectors was detected at line ${i + 1} ` +
          `without a \`.hint()\` to force index usage. Without an index hint the query planner may perform ` +
          `a collection scan. Add a compound index on the query fields and optionally call \`.hint(indexName)\` ` +
          `to ensure consistent index use.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
