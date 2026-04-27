import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const HANDLER_PATTERN = /\b(onClick|onInput|onChange)\s*=\s*\{/;
const HEAVY_OP_PATTERN = /\bfor\s*\(|JSON\.parse\(|JSON\.stringify\(/;

export async function detectInp(ctx: AuditContext): Promise<AuditFinding[]> {
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

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!HANDLER_PATTERN.test(line)) continue;
      // Check within 8 lines after handler
      const windowEnd = Math.min(i + 8, lines.length);
      const windowText = lines.slice(i, windowEnd).join('\n');
      if (HEAVY_OP_PATTERN.test(windowText)) {
        findings.push({
          severity: 'medium',
          title: 'Synchronous heavy computation in event handler — may increase INP',
          category: 'performance:inp',
          filePath: relative(ctx.cwd, filePath),
          description:
            'File contains onClick/onInput/onChange event handlers with synchronous heavy operations (for loops, JSON.parse) nearby. ' +
            'Move heavy computation off the main thread using Web Workers or break it into async chunks to reduce Interaction to Next Paint (INP).',
        });
        break; // one finding per file max
      }
    }
  }

  return findings;
}
