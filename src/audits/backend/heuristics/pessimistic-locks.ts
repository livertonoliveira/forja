import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__tests__']);

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...collectFiles(join(dir, entry.name)));
      }
    } else if (entry.isFile() && /\.[jt]s$/.test(entry.name)) {
      results.push(join(dir, entry.name));
    }
  }
  return results;
}

const FOR_UPDATE_RE = /FOR\s+UPDATE/i;
const NOWAIT_RE = /NOWAIT/i;
const SKIP_LOCKED_RE = /SKIP\s+LOCKED/i;
const LOCK_TIMEOUT_RE = /lock_timeout/i;
const TX_BEGIN_RE = /\bBEGIN\b|START\s+TRANSACTION|\.transaction\(|withTransaction\(|transactional/i;

export async function detectPessimisticLocks(ctx: AuditContext): Promise<AuditFinding[]> {
  const srcDir = join(ctx.cwd, 'src');
  let files: string[];
  try {
    files = collectFiles(srcDir);
  } catch {
    return [];
  }

  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    const relativePath = relative(ctx.cwd, filePath);
    let lines: string[];
    try {
      lines = readFileSync(filePath, 'utf8').split('\n');
    } catch {
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      if (!FOR_UPDATE_RE.test(lines[i])) continue;

      const lineNumber = i + 1;
      const surrounding = lines.slice(Math.max(0, i - 3), i + 4);
      const hasNowait = surrounding.some((l) => NOWAIT_RE.test(l));
      const hasSkipLocked = surrounding.some((l) => SKIP_LOCKED_RE.test(l));
      const before10 = lines.slice(Math.max(0, i - 10), i + 1);
      const hasLockTimeout = before10.some((l) => LOCK_TIMEOUT_RE.test(l));

      if (!hasNowait && !hasSkipLocked && !hasLockTimeout) {
        findings.push({
          severity: 'medium',
          title: 'FOR UPDATE without timeout or SKIP LOCKED',
          category: 'performance:pessimistic-locks',
          filePath: relativePath,
          line: lineNumber,
          description: `\`FOR UPDATE\` at line ${lineNumber} has no \`NOWAIT\`, \`SKIP LOCKED\`, or \`lock_timeout\` setting. Under contention this will block indefinitely. Add \`NOWAIT\` or \`SKIP LOCKED\`, or set \`lock_timeout\` before the query.`,
        });
      }

      const window20 = lines.slice(Math.max(0, i - 20), i + 21);
      const inTransaction = window20.some((l) => TX_BEGIN_RE.test(l));
      if (!inTransaction) {
        findings.push({
          severity: 'medium',
          title: 'FOR UPDATE used outside explicit transaction',
          category: 'performance:pessimistic-locks',
          filePath: relativePath,
          line: lineNumber,
          description: `\`FOR UPDATE\` at line ${lineNumber} does not appear to be inside an explicit transaction. Pessimistic locks without transactions can cause lock leaks. Wrap the query in a transaction block.`,
        });
      }
    }
  }

  return findings;
}
