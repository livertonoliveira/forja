import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const QUERY_CACHE_TYPE_PATTERN = /query_cache_type\s*=\s*[1-9ON]/i;
const QUERY_CACHE_SIZE_PATTERN = /query_cache_size\s*=\s*[1-9]/i;

export async function detectQueryCache(ctx: AuditContext): Promise<AuditFinding[]> {
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
      const isType = QUERY_CACHE_TYPE_PATTERN.test(line);
      const isSize = QUERY_CACHE_SIZE_PATTERN.test(line);
      if (!isType && !isSize) continue;
      const setting = isType ? 'query_cache_type' : 'query_cache_size';
      findings.push({
        severity: 'medium',
        title: 'MySQL query cache is enabled',
        category: 'database:mysql:query-cache',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `MySQL query cache (\`${setting}\`) is enabled at line ${i + 1}. ` +
          `The query cache was removed in MySQL 8.0 and causes mutex contention in earlier versions under concurrent workloads. ` +
          `Disable it by setting \`query_cache_type=0\` and \`query_cache_size=0\`. ` +
          `Use application-level caching (e.g. Redis or Memcached) for result caching instead.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
