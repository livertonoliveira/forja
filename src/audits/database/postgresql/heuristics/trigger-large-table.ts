import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const CREATE_TRIGGER_PATTERN = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/i;
const WHEN_PATTERN = /\bWHEN\b/i;

export async function detectTriggerLargeTable(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!CREATE_TRIGGER_PATTERN.test(line)) continue;
      const window = lines.slice(i, Math.min(lines.length, i + 10)).join('\n');
      if (WHEN_PATTERN.test(window)) continue;
      findings.push({
        severity: 'medium',
        title: 'Trigger without WHEN condition fires on every row change',
        category: 'database:postgresql:trigger-large-table',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `\`CREATE TRIGGER\` at line ${i + 1} does not include a \`WHEN\` condition. Without a \`WHEN\` clause, ` +
          `the trigger function is invoked for every row change (INSERT/UPDATE/DELETE), which causes significant ` +
          `overhead on large or frequently-written tables. Add a \`WHEN\` condition to limit trigger execution ` +
          `to rows where relevant data actually changes, e.g. \`WHEN (OLD.updated_at IS DISTINCT FROM NEW.updated_at)\`.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
