import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const FOR_UPDATE_PATTERN = /FOR\s+UPDATE/i;
const TIMEOUT_PATTERN = /lock_timeout|statement_timeout/i;

export async function detectForUpdateNoTimeout(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!FOR_UPDATE_PATTERN.test(line)) continue;
      const window = lines.slice(Math.max(0, i - 20), i + 1).join('\n');
      if (TIMEOUT_PATTERN.test(window)) continue;
      findings.push({
        severity: 'high',
        title: 'FOR UPDATE without lock_timeout can block indefinitely',
        category: 'database:postgresql:for-update-no-timeout',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `\`FOR UPDATE\` at line ${i + 1} was found without a preceding \`SET lock_timeout\` or \`SET statement_timeout\`. ` +
          `Row-level locks acquired by \`FOR UPDATE\` will block other transactions indefinitely if the locking ` +
          `transaction is slow or stuck. Always set \`SET lock_timeout = '5s'\` (or a suitable value) before ` +
          `executing locking queries to prevent cascading lock waits.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
