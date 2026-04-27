import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const MONGO_CONNECT_PATTERN = /MongoClient\s*\(|mongoose\.connect\s*\(|MONGO_URI/;
const OPLOG_CONFIG_PATTERN = /oplogSizeMB|--oplogSize|oplogSize/;
// Only flag replica set connections — standalone instances do not have an oplog
const REPLICA_SET_PATTERN = /replicaSet|rs\.|replSet|rs0|replica/i;

export async function detectOplogRetention(ctx: AuditContext): Promise<AuditFinding[]> {
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
    if (!MONGO_CONNECT_PATTERN.test(content)) continue;
    if (OPLOG_CONFIG_PATTERN.test(content)) continue;
    // Only flag files that indicate a replica set connection
    if (!REPLICA_SET_PATTERN.test(content)) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      if (!MONGO_CONNECT_PATTERN.test(lines[i])) continue;
      findings.push({
        severity: 'low',
        title: 'Oplog retention not explicitly configured',
        category: 'database:mongodb:oplog-retention',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A MongoDB connection was detected at line ${i + 1} without an explicit oplog retention configuration ` +
          `(\`oplogSizeMB\` or \`--oplogSize\`). Without explicit configuration the oplog size defaults to 5% of ` +
          `free disk space, which may be insufficient for replica set recovery windows. Set \`oplogSizeMB\` in ` +
          `\`mongod.conf\` or pass \`--oplogSize\` at startup to ensure adequate change stream / replication lag headroom.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
      break; // One finding per file
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
