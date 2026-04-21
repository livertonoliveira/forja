import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const FOREIGN_KEY_PATTERN = /FOREIGN\s+KEY\b/i;
const DEFERRABLE_PATTERN = /DEFERRABLE/i;

export async function detectDeferrableConstraint(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!FOREIGN_KEY_PATTERN.test(line)) continue;
      // Check the FK line and the next 2 lines for DEFERRABLE
      const window = lines.slice(i, Math.min(lines.length, i + 3)).join('\n');
      if (DEFERRABLE_PATTERN.test(window)) continue;
      findings.push({
        severity: 'low',
        title: 'FOREIGN KEY constraint is not DEFERRABLE',
        category: 'database:postgresql:deferrable-constraint',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`FOREIGN KEY\` constraint at line ${i + 1} does not include the \`DEFERRABLE\` modifier. ` +
          `Non-deferrable FK constraints are checked immediately after each statement, which can cause ` +
          `constraint violation errors during bulk loads, data migrations, or replication scenarios where ` +
          `parent rows are inserted after child rows. Consider adding \`DEFERRABLE INITIALLY DEFERRED\` ` +
          `to allow constraint checking at transaction commit time.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
