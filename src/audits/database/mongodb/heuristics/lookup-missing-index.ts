import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const LOOKUP_PATTERN = /["']?\$lookup["']?\s*:/;
const FOREIGN_FIELD_PATTERN = /["']?foreignField["']?\s*:\s*["']?(\w+)["']?/;
const INDEX_HINT_PATTERN = /\.hint\s*\(|index\s*:\s*\{|createIndex\s*\(|ensureIndex\s*\(/;

export async function detectLookupMissingIndex(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!LOOKUP_PATTERN.test(line)) continue;
      // Gather the $lookup block (next 15 lines)
      const block = lines.slice(i, i + 15).join('\n');
      const foreignFieldMatch = FOREIGN_FIELD_PATTERN.exec(block);
      if (!foreignFieldMatch) continue;
      const foreignField = foreignFieldMatch[1];
      // Check the entire file for index hints or index definitions related to this field
      if (INDEX_HINT_PATTERN.test(content)) continue;
      findings.push({
        severity: 'high',
        title: '$lookup without index on foreignField',
        category: 'database:mongodb:lookup-missing-index',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A \`$lookup\` pipeline stage referencing \`foreignField: "${foreignField}"\` was detected at line ${i + 1} ` +
          `without a corresponding index definition or hint. Without an index on the foreign field, MongoDB performs ` +
          `a full collection scan on the joined collection for every document. Create an index on \`${foreignField}\` ` +
          `in the target collection to avoid O(n²) complexity.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
