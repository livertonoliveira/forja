import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const IMG_TAG = /<img\b[^>]*>/gi;
const FETCHPRIORITY_ATTR = /\bfetchpriority\s*=/i;

export async function detectLcp(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const allFiles = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const files = allFiles.filter((f) => /\.[jt]sx$/.test(f));
  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const matches = content.matchAll(IMG_TAG);
    for (const match of matches) {
      const tag = match[0];
      if (!FETCHPRIORITY_ATTR.test(tag)) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        findings.push({
          severity: 'medium',
          title: 'Above-the-fold image missing fetchpriority="high"',
          category: 'performance:lcp',
          filePath: relative(ctx.cwd, filePath),
          line: lineNumber,
          description:
            'Images likely to be the Largest Contentful Paint element should have fetchpriority="high" to prioritize loading.',
        });
        break; // one finding per file
      }
    }
  }

  return findings;
}
