import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const CHARSET_PATTERN = /CHARSET\s*=\s*utf8\b(?!mb4)/i;
const CHARACTER_SET_PATTERN = /CHARACTER\s+SET\s+utf8\b(?!mb4)/i;

export async function detectUtf8Charset(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!CHARSET_PATTERN.test(line) && !CHARACTER_SET_PATTERN.test(line)) continue;
      findings.push({
        severity: 'high',
        title: 'Use of utf8 charset instead of utf8mb4',
        category: 'database:mysql:utf8-charset',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `The \`utf8\` charset in MySQL only supports 3-byte characters and cannot store emoji or some CJK (Chinese, Japanese, Korean) characters. ` +
          `Detected at line ${i + 1}. Use \`utf8mb4\` instead, which is the true 4-byte UTF-8 encoding. ` +
          `Update the DDL to \`CHARSET=utf8mb4\` or \`CHARACTER SET utf8mb4\` and set \`collation_server=utf8mb4_unicode_ci\`.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
