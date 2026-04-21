import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const PUSH_PATTERN = /["']?\$push["']?\s*:/;
const SLICE_PATTERN = /["']?\$slice["']?\s*:/;

export async function detectPushWithoutSlice(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!PUSH_PATTERN.test(line)) continue;
      // Check the $push block (surrounding 10 lines) for $slice
      const block = lines.slice(Math.max(0, i - 2), i + 15).join('\n');
      if (SLICE_PATTERN.test(block)) continue;
      findings.push({
        severity: 'medium',
        title: '$push without $slice causes unbounded array growth',
        category: 'database:mongodb:push-without-slice',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`$push\` update operator at line ${i + 1} was detected without a corresponding \`$slice\` modifier. ` +
          `Without \`$slice\`, each \`$push\` appends an element permanently, causing arrays to grow without bound. ` +
          `Use \`{ $push: { field: { $each: [value], $slice: -N } } }\` to maintain a fixed-size sliding window, ` +
          `or enforce a maximum length via application logic before the update.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
