import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const CREATE_TABLE_PATTERN = /CREATE\s+TABLE/i;
const FK_COLUMN_PATTERN = /(\w+_id)\s+INT/i;
const FOREIGN_KEY_PATTERN = /FOREIGN\s+KEY/i;

export async function detectForeignKeyMissing(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!CREATE_TABLE_PATTERN.test(line)) continue;
      // Scan up to 30 lines after CREATE TABLE for the table block
      const blockLines = lines.slice(i, Math.min(lines.length, i + 30));
      const block = blockLines.join('\n');
      const fkColMatch = FK_COLUMN_PATTERN.exec(block);
      if (!fkColMatch) continue;
      if (FOREIGN_KEY_PATTERN.test(block)) continue;
      const colName = fkColMatch[1];
      findings.push({
        severity: 'medium',
        title: 'FK-convention column without FOREIGN KEY constraint',
        category: 'database:mysql:foreign-key-missing',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A CREATE TABLE block starting at line ${i + 1} contains a column \`${colName}\` that follows foreign key naming conventions ` +
          `but has no FOREIGN KEY constraint defined. Missing FK constraints allow orphaned rows and break referential integrity. ` +
          `Add \`FOREIGN KEY (${colName}) REFERENCES referenced_table(id)\` to enforce the relationship at the database level. ` +
          `Ensure the referenced column is indexed for join performance.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
