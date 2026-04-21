import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const POOL_CREATE_PATTERN = /new\s+Pool\s*\(|createPool\s*\(/;
const MAX_PROP_PATTERN = /max\s*:/;
const MAX_VALUE_PATTERN = /max\s*:\s*(\d+)/;

export async function detectConnectionPool(ctx: AuditContext): Promise<AuditFinding[]> {
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
    if (!POOL_CREATE_PATTERN.test(content)) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      if (!POOL_CREATE_PATTERN.test(line)) continue;
      const callBlock = lines.slice(i, Math.min(lines.length, i + 5)).join('\n');
      if (!MAX_PROP_PATTERN.test(callBlock)) {
        findings.push({
          severity: 'medium',
          title: 'Connection pool created without max cap',
          category: 'database:postgresql:connection-pool',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `\`new Pool()\` or \`createPool()\` at line ${i + 1} does not specify a \`max\` property. ` +
            `Without an explicit cap, \`pg\` defaults to 10 connections. For pgbouncer setups, the pool size ` +
            `should not exceed pgbouncer's \`pool_size\`. Set \`max\` explicitly based on your PostgreSQL ` +
            `\`max_connections\` and the number of application instances.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
        continue;
      }
      const maxMatch = MAX_VALUE_PATTERN.exec(callBlock);
      if (maxMatch && parseInt(maxMatch[1], 10) > 100) {
        findings.push({
          severity: 'medium',
          title: 'Connection pool max is set too high (> 100)',
          category: 'database:postgresql:connection-pool',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `\`new Pool()\` or \`createPool()\` at line ${i + 1} sets \`max\` to ${maxMatch[1]}, which exceeds 100. ` +
            `A very high pool max can exhaust PostgreSQL's \`max_connections\`, causing connection errors for other ` +
            `clients. For pgbouncer setups, keep \`max\` ≤ pgbouncer's \`pool_size\`. Size the pool based on ` +
            `server CPU count and expected concurrent query load.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
