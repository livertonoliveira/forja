import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const UPSERT_PATTERN = /\.(updateOne|findOneAndUpdate|replaceOne)\s*\(/;
const UPSERT_OPTION = /upsert\s*:\s*true/;
const UNIQUE_INDEX_PATTERN = /unique\s*:\s*true/;

export async function detectUpsertNoUniqueIndex(ctx: AuditContext): Promise<AuditFinding[]> {
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
    // If this file defines a unique index, skip — assume it's covered
    const hasUniqueIndex = UNIQUE_INDEX_PATTERN.test(content);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      if (!UPSERT_PATTERN.test(line)) continue;
      // Look for upsert: true in the surrounding call (next 10 lines)
      const block = lines.slice(i, i + 10).join('\n');
      if (!UPSERT_OPTION.test(block)) continue;
      if (hasUniqueIndex) continue;
      const method = /\.(updateOne|findOneAndUpdate|replaceOne)/.exec(line)?.[1] ?? 'updateOne';
      findings.push({
        severity: 'high',
        title: 'Upsert without unique index risks duplicate documents',
        category: 'database:mongodb:upsert-no-unique-index',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `\`.${method}()\` with \`{ upsert: true }\` was detected at line ${i + 1} without a \`unique: true\` ` +
          `index visible in this file. Without a unique index, a race condition between two concurrent upserts ` +
          `on the same filter can insert duplicate documents. Add a unique index on the filter fields and handle ` +
          `duplicate key errors (\`E11000\`) to ensure idempotent upserts.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
