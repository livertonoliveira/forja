import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const WEAK_WRITE_CONCERN =
  /writeConcern\s*:\s*\{\s*w\s*:\s*["']?0["']?\s*\}|[{,]\s*w\s*:\s*["']?0["']?\s*[},]/;

export async function detectWeakWriteConcern(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!WEAK_WRITE_CONCERN.test(line)) continue;
      findings.push({
        severity: 'critical',
        title: 'Weak writeConcern (w:0) risks data loss',
        category: 'database:mongodb:write-concern',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `\`writeConcern: { w: 0 }\` (fire-and-forget) was detected at line ${i + 1}. ` +
          `With \`w:0\` MongoDB acknowledges the write before it is even applied — meaning data can be silently ` +
          `lost on network errors or server crashes. Use \`w: 1\` (primary acknowledgement) at minimum, or ` +
          `\`w: "majority"\` for critical data to ensure durability.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
