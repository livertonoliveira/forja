import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../utils.js';

const MODULE_CACHE_RE = /(?:const|let|var)\s+\w+\s*=\s*new\s+(?:Map|Set)\s*(?:<[^>]*>)?\s*\(\s*\)/;
const EVICTION_RE = /\.(?:delete|clear)\s*\(|LRU|lru-cache|maxSize|MAX_SIZE/;

export async function detectMemoryGrowth(ctx: AuditContext): Promise<AuditFinding[]> {
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
      const line = lines[i];
      if (!MODULE_CACHE_RE.test(line)) continue;

      // Check if the entire file has any eviction pattern
      if (EVICTION_RE.test(content)) continue;

      findings.push({
        severity: 'medium',
        title: 'Unbounded Map/Set used as in-memory cache',
        category: 'performance:memory-growth',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A Map or Set is initialized at module scope at line ${i + 1} with no eviction strategy detected. ` +
          `Without size limits or TTL-based eviction, this cache grows unboundedly and will eventually ` +
          `exhaust available heap memory. Replace with an LRU cache (e.g. lru-cache npm package) ` +
          `with an explicit maxSize, or add periodic .clear() / .delete() calls to bound memory usage.`,
      });
    }
  }

  return findings;
}
