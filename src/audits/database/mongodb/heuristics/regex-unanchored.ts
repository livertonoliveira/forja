import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

// $regex: /pattern/ — check if the regex literal does NOT start with ^
const REGEX_LITERAL = /["']?\$regex["']?\s*:\s*\/([^/]*)\//;
// $regex: "pattern" — check if the string does NOT start with ^
const REGEX_STRING = /["']?\$regex["']?\s*:\s*["']([^"']*)['"]/;

export async function detectRegexUnanchored(ctx: AuditContext): Promise<AuditFinding[]> {
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
      const literalMatch = REGEX_LITERAL.exec(line);
      if (literalMatch) {
        if (!literalMatch[1].startsWith('^')) {
          findings.push({
            severity: 'medium',
            title: 'Unanchored $regex prevents index use',
            category: 'database:mongodb:regex-unanchored',
            filePath: relative(ctx.cwd, filePath),
            line: i + 1,
            description:
              `An unanchored \`$regex\` pattern (\`/${literalMatch[1]}/\`) was detected at line ${i + 1}. ` +
              `MongoDB can only use an index for regex queries anchored at the start with \`^\`. Without the anchor, ` +
              `the query performs a collection scan. Prefix the pattern with \`^\` if a prefix match is acceptable, ` +
              `or consider a full-text search index with \`$text\` for mid-string search requirements.`,
          });
          if (findings.length >= MAX_FINDINGS) break;
        }
        continue;
      }
      const stringMatch = REGEX_STRING.exec(line);
      if (stringMatch) {
        if (!stringMatch[1].startsWith('^')) {
          findings.push({
            severity: 'medium',
            title: 'Unanchored $regex prevents index use',
            category: 'database:mongodb:regex-unanchored',
            filePath: relative(ctx.cwd, filePath),
            line: i + 1,
            description:
              `An unanchored \`$regex\` pattern (\`"${stringMatch[1]}"\`) was detected at line ${i + 1}. ` +
              `MongoDB can only use an index for regex queries anchored at the start with \`^\`. Without the anchor, ` +
              `the query performs a collection scan. Prefix the pattern with \`^\` if a prefix match is acceptable, ` +
              `or consider a full-text search index with \`$text\` for mid-string search requirements.`,
          });
          if (findings.length >= MAX_FINDINGS) break;
        }
      }
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
