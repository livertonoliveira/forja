import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const SCHEMA_CONTENT_PATTERN = /Schema\s*\(|mongoose\.model\s*\(/;
// Matches arrays of embedded sub-documents or Mixed types
const NESTED_ARRAY_PATTERN =
  /\[\s*\{[^}]*\}|\[\s*(?:mongoose\.Schema\.Types\.Mixed|Schema\.Types\.Mixed)\s*\]|type\s*:\s*\[\s*\{/;

export async function detectBsonLimit(ctx: AuditContext): Promise<AuditFinding[]> {
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
    if (!SCHEMA_CONTENT_PATTERN.test(content)) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      if (!NESTED_ARRAY_PATTERN.test(line)) continue;
      findings.push({
        severity: 'high',
        title: 'Potential BSON 16MB document size violation',
        category: 'database:mongodb:bson-limit',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A nested array of sub-documents or Mixed-typed array was detected at line ${i + 1}. ` +
          `Embedding unbounded arrays of sub-documents risks exceeding MongoDB's 16MB BSON document size limit. ` +
          `Consider moving large nested arrays to a separate collection and referencing them by ID, or enforcing ` +
          `a strict size cap with schema validation.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
