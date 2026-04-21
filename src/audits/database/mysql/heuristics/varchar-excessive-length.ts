import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const VARCHAR_PATTERN = /\bVARCHAR\s*\(\s*(\d+)\s*\)/gi;
const MAX_VARCHAR_LENGTH = 1000;

export async function detectVarcharExcessiveLength(ctx: AuditContext): Promise<AuditFinding[]> {
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
      VARCHAR_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = VARCHAR_PATTERN.exec(line)) !== null) {
        const length = parseInt(match[1], 10);
        if (length <= MAX_VARCHAR_LENGTH) continue;
        findings.push({
          severity: 'low',
          title: `VARCHAR(${length}) exceeds recommended maximum length`,
          category: 'database:mysql:varchar-excessive-length',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `\`VARCHAR(${length})\` at line ${i + 1} has an excessive length. ` +
            `VARCHAR columns wider than ${MAX_VARCHAR_LENGTH} characters waste memory during temporary table creation ` +
            `and may cause performance issues in GROUP BY or ORDER BY operations. ` +
            `Set VARCHAR length to the realistic maximum for the data (e.g. VARCHAR(255) for emails, VARCHAR(500) for URLs). ` +
            `Consider TEXT or MEDIUMTEXT for truly unbounded strings.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
