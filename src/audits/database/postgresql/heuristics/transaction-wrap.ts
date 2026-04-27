import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const QUERY_CALL_PATTERN = /\.(query|execute)\s*\(/g;
const DML_PATTERN = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/i;
const BEGIN_PATTERN = /BEGIN|client\.query\s*\(\s*['"`]BEGIN['"`]/i;

export async function detectTransactionWrap(ctx: AuditContext): Promise<AuditFinding[]> {
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
      // Scan a 15-line window starting from line i
      const windowLines = lines.slice(i, Math.min(lines.length, i + 15));
      const windowText = windowLines.join('\n');
      const matches = windowText.match(QUERY_CALL_PATTERN);
      if (!matches || matches.length < 2) continue;
      if (!DML_PATTERN.test(windowText)) continue;
      // Extend BEGIN check 5 lines backward to catch wrapping transactions
      const extendedWindow = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 15)).join('\n');
      if (BEGIN_PATTERN.test(extendedWindow)) continue;
      findings.push({
        severity: 'medium',
        title: 'Multiple queries without explicit transaction',
        category: 'database:postgresql:transaction-wrap',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `${matches.length} \`.query()\` or \`.execute()\` calls were detected within a 15-line window at line ${i + 1} ` +
          `without a surrounding \`BEGIN\`/\`COMMIT\` transaction block. If an intermediate query fails, earlier ` +
          `mutations will not be rolled back, leaving the database in an inconsistent state. Wrap multi-statement ` +
          `operations in \`BEGIN\`/\`COMMIT\` using a dedicated client from the pool.`,
      });
      // Skip ahead to avoid overlapping windows
      i += 14;
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
