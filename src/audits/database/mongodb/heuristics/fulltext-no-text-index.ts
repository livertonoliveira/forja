import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const FULLTEXT_PATTERN = /["']?\$text["']?\s*:|["']?\$search["']?\s*:/;
const TEXT_INDEX_PATTERN = /type\s*:\s*['"]text['"]|['"]text['"]\s*:\s*['"]text['"]/;

export async function detectFulltextNoTextIndex(ctx: AuditContext): Promise<AuditFinding[]> {
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
    if (!FULLTEXT_PATTERN.test(content)) continue;
    // If this file also defines a text index, skip
    if (TEXT_INDEX_PATTERN.test(content)) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      if (!FULLTEXT_PATTERN.test(line)) continue;
      findings.push({
        severity: 'high',
        title: 'Full-text search without text index',
        category: 'database:mongodb:fulltext-no-text-index',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A full-text search operator (\`$text\` or \`$search\`) was detected at line ${i + 1} ` +
          `without a corresponding \`type: 'text'\` index definition visible in this file. ` +
          `Without a text index, MongoDB throws an error (\`text index required for $text query\`) ` +
          `or falls back to a collection scan. Create a text index on the relevant field(s) using ` +
          `\`{ field: 'text' }\` in your schema or \`createIndex\` call.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
