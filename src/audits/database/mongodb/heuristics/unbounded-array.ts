import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const SCHEMA_FILE_PATTERN = /\.(schema|model)\.[jt]s$/;
const SCHEMA_CONTENT_PATTERN = /Schema\s*\(|mongoose\.model\s*\(/;
const ARRAY_FIELD_PATTERN = /type\s*:\s*\[\s*(String|Number|Boolean|Date|Schema\.Types\.\w+|mongoose\.Schema\.Types\.\w+)\s*\]/;
const SIZE_CONSTRAINT_PATTERN = /maxlength|maxLength|max\s*:|validate\s*:/;

function scanLines(
  lines: string[],
  filePath: string,
  relPath: string,
  findings: AuditFinding[],
  abortSignal: AbortSignal,
): void {
  for (let i = 0; i < lines.length; i++) {
    if (abortSignal.aborted) break;
    if (findings.length >= MAX_FINDINGS) break;
    const line = lines[i];
    if (!ARRAY_FIELD_PATTERN.test(line)) continue;
    // Check nearby lines for size constraints
    const window = lines.slice(Math.max(0, i - 2), i + 5).join('\n');
    if (SIZE_CONSTRAINT_PATTERN.test(window)) continue;
    findings.push({
      severity: 'medium',
      title: 'Array field without size constraint',
      category: 'database:mongodb:unbounded-array',
      filePath: relPath,
      line: i + 1,
      description:
        `An array field defined with a primitive type (e.g. \`type: [String]\`) was detected at line ${i + 1} ` +
        `without a \`maxlength\` or size validation. Unbounded arrays can grow indefinitely, leading to ` +
        `performance degradation and risk of hitting the 16MB BSON document limit. Add a \`maxlength\` ` +
        `validator or enforce a maximum size via a custom validate function.`,
    });
  }
}

export async function detectUnboundedArray(ctx: AuditContext): Promise<AuditFinding[]> {
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
    if (findings.length >= MAX_FINDINGS) break;
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    // Only scan schema/model files or files that define schemas
    if (!SCHEMA_FILE_PATTERN.test(filePath) && !SCHEMA_CONTENT_PATTERN.test(content)) continue;
    scanLines(content.split('\n'), filePath, relative(ctx.cwd, filePath), findings, ctx.abortSignal);
  }
  return findings;
}
