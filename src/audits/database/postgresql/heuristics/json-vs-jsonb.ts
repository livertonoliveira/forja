import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

// Match JSON column type but not JSONB — DDL column definition patterns
const JSON_COLUMN_PATTERN = /\s+JSON\s*[,\n]|\s+JSON\s+NOT\s+NULL/i;

export async function detectJsonVsJsonb(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!JSON_COLUMN_PATTERN.test(line)) continue;
      // Exclude lines that contain JSONB — the pattern above should not match JSONB,
      // but double-check to avoid false positives
      if (/JSONB/i.test(line)) continue;
      findings.push({
        severity: 'medium',
        title: 'JSON column type used instead of JSONB',
        category: 'database:postgresql:json-vs-jsonb',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`JSON\` column type was detected at line ${i + 1}. PostgreSQL's \`JSON\` type stores raw text and ` +
          `re-parses it on every access, which is slower than \`JSONB\`. \`JSONB\` stores a binary representation, ` +
          `supports GIN indexes for efficient key/value lookups, and deduplicates object keys. Migrate the column ` +
          `to \`JSONB\` unless you specifically need to preserve whitespace or duplicate keys.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
