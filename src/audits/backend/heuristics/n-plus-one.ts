import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__tests__']);
const QUERY_METHODS =
  /await\s+\w[\w.]*\s*\.\s*(?:find|findOne|findMany|findAndCount|query|execute|select|insert|update|delete|count|save|remove|getMany|getOne)\s*\(/;
const LOOP_PATTERN = /(?:forEach|map)\(\s*async/;

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.isFile() && /\.[jt]s$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

export async function detectNPlusOne(ctx: AuditContext): Promise<AuditFinding[]> {
  const srcDir = join(ctx.cwd, 'src');
  let files: string[];
  try {
    files = collectFiles(srcDir);
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
      const match = LOOP_PATTERN.exec(line);
      if (!match) continue;

      const loopMethod = line.includes('forEach') ? 'forEach' : 'map';
      const window = lines.slice(i + 1, i + 31).join('\n');
      if (!QUERY_METHODS.test(window)) continue;

      const lineNumber = i + 1;
      findings.push({
        severity: 'medium',
        title: 'Potential N+1 query inside forEach/map',
        category: 'performance:n-plus-one',
        filePath: relative(ctx.cwd, filePath),
        line: lineNumber,
        description:
          `Async query call detected inside \`${loopMethod}\` callback at line ${lineNumber}. ` +
          `This causes one DB query per iteration (N+1 problem). Consider batching with ` +
          `\`Promise.all\` over a pre-fetched list, or using a JOIN/include/eager-load approach.`,
      });
    }
  }

  return findings;
}
