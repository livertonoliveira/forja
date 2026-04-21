import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const MONGO_CONFIG_PATTERN = /mongoose\.connect\s*\(|MongoClient\s*\(|mongod\.conf|wiredTiger/;
const CACHE_CONFIG_PATTERN = /wiredTigerCacheSizeGB|cacheSizeGB|wiredTiger.*cache/;

export async function detectWiredTigerCache(ctx: AuditContext): Promise<AuditFinding[]> {
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
    // Only scan files that configure MongoDB connections
    if (!MONGO_CONFIG_PATTERN.test(content)) continue;
    if (CACHE_CONFIG_PATTERN.test(content)) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      if (!/mongoose\.connect\s*\(|MongoClient\s*\(/.test(line)) continue;
      findings.push({
        severity: 'low',
        title: 'WiredTiger cache size not explicitly configured',
        category: 'database:mongodb:wiredtiger-cache',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A MongoDB connection at line ${i + 1} does not configure WiredTiger cache size (\`wiredTigerCacheSizeGB\` ` +
          `or \`cacheSizeGB\`). By default WiredTiger uses 50% of RAM minus 1GB, which may be suboptimal in ` +
          `containerised or shared environments. Explicitly set \`storage.wiredTiger.engineConfig.cacheSizeGB\` ` +
          `in \`mongod.conf\` to control memory usage and prevent OOM (out-of-memory) kills.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
      break; // One finding per file
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
