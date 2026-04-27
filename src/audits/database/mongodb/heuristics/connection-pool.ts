import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const CONNECT_PATTERN = /mongoose\.connect\s*\(|MongoClient\s*\(/;
const POOL_SIZE_PATTERN = /maxPoolSize|poolSize/;

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
    if (!CONNECT_PATTERN.test(content)) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      if (!CONNECT_PATTERN.test(line)) continue;
      // Check the connect call and its options object (next 15 lines)
      const callBlock = lines.slice(i, i + 15).join('\n');
      if (POOL_SIZE_PATTERN.test(callBlock)) continue;
      findings.push({
        severity: 'medium',
        title: 'Connection pool size not configured',
        category: 'database:mongodb:connection-pool',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `\`mongoose.connect\` or \`MongoClient\` at line ${i + 1} does not specify \`maxPoolSize\`. ` +
          `The default pool size (5 for Mongoose, 100 for the Node.js driver) may be too low or too high for ` +
          `your workload, leading to queued operations under load or excessive idle connections. Set \`maxPoolSize\` ` +
          `explicitly in the connection options based on your server's CPU count and expected concurrency.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
