import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const TOP_LEVEL_LOOP = /^(?:for|while)\s*\(/m;

export async function detectTti(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const files = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (TOP_LEVEL_LOOP.test(content)) {
      findings.push({
        severity: 'low',
        title: 'Top-level synchronous loop may block main thread and delay TTI',
        category: 'performance:tti',
        filePath: relative(ctx.cwd, filePath),
        description:
          'A for/while loop at module top level (not inside a function) runs synchronously during module evaluation, ' +
          'blocking the main thread and delaying Time to Interactive (TTI). Move heavy initialization into functions or use async patterns.',
      });
    }
  }

  return findings;
}
