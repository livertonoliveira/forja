import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__tests__']);
const NESTJS_GET = /@Get\(/;
const EXPRESS_GET = /(?:router|app|fastify)\s*\.\s*get\s*\(/;

function collectFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) collectFiles(join(dir, entry.name), files);
    } else if (/\.[tj]s$/.test(entry.name)) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

export async function detectMissingCache(ctx: AuditContext): Promise<AuditFinding[]> {
  const srcDir = join(ctx.cwd, 'src');
  const findings: AuditFinding[] = [];

  let files: string[];
  try {
    files = collectFiles(srcDir);
  } catch {
    return findings;
  }

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relativePath = relative(ctx.cwd, filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNumber = i + 1;

      if (NESTJS_GET.test(line)) {
        const lookback = lines.slice(Math.max(0, i - 5), i);
        if (!lookback.some(l => l.includes('@CacheKey('))) {
          findings.push(makeFinding(relativePath, lineNumber));
        }
      } else if (EXPRESS_GET.test(line)) {
        const lookahead = lines.slice(i + 1, i + 31);
        if (!lookahead.some(l => l.includes('Cache-Control'))) {
          findings.push(makeFinding(relativePath, lineNumber));
        }
      }
    }
  }

  return findings;
}

function makeFinding(filePath: string, line: number): AuditFinding {
  return {
    severity: 'low',
    title: 'GET endpoint missing cache directive',
    category: 'performance:missing-cache',
    filePath,
    line,
    description: `GET endpoint at line ${line} has no \`Cache-Control\` header or \`@CacheKey\` decorator. Consider adding caching for read-heavy endpoints to reduce DB load.`,
  };
}
