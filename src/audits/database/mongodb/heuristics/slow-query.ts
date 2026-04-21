import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const QUERY_PATTERN = /\.(find|findOne|aggregate)\s*\(/;
const MAX_TIME_PATTERN = /\.maxTimeMS\s*\(|maxTimeMS\s*:/;

export async function detectSlowQuery(ctx: AuditContext): Promise<AuditFinding[]> {
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
      // Check the query call and chained methods (next 10 lines)
      const callBlock = lines.slice(i, i + 10).join('\n');
      if (MAX_TIME_PATTERN.test(callBlock)) continue;
      const method = /\.(find|findOne|aggregate)/.exec(line)?.[1] ?? 'query';
      findings.push({
        severity: 'medium',
        title: 'Query without maxTimeMS timeout (slow query risk)',
        category: 'database:mongodb:slow-query',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`.${method}()\` call at line ${i + 1} does not set \`maxTimeMS\`. Without a server-side timeout, ` +
          `a slow or runaway query can hold resources indefinitely, degrading overall database performance. ` +
          `Chain \`.maxTimeMS(5000)\` on the query or pass \`{ maxTimeMS: 5000 }\` in the options object ` +
          `to enforce an upper time bound.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
