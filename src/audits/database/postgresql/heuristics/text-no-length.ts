import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const CREATE_TABLE_PATTERN = /\bCREATE\s+TABLE\b/i;
const TEXT_COLUMN_PATTERN = /\s+TEXT\s*[,\n]/i;

export async function detectTextNoLength(ctx: AuditContext): Promise<AuditFinding[]> {
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
      // Scan the next 30 lines for TEXT column definitions
      const ddlWindow = lines.slice(i + 1, Math.min(lines.length, i + 31));
      for (let j = 0; j < ddlWindow.length; j++) {
        if (ctx.abortSignal.aborted) break;
        const colLine = ddlWindow[j];
        if (!TEXT_COLUMN_PATTERN.test(colLine)) continue;
        findings.push({
          severity: 'low',
          title: 'TEXT column without length constraint in DDL',
          category: 'database:postgresql:text-no-length',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1 + j + 1,
          description:
            `A \`TEXT\` column definition was found at line ${i + 1 + j + 1} inside a \`CREATE TABLE\` statement. ` +
            `\`TEXT\` has no maximum length enforced by PostgreSQL, which can lead to accidental storage of ` +
            `unbounded data in critical fields like email or name. For such fields, prefer \`VARCHAR(255)\` to ` +
            `enforce an application-level constraint and communicate intent clearly.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
