import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const BUFFER_POOL_PATTERN = /innodb_buffer_pool_size\s*=\s*(\d+)(M|MB|G|GB|K|KB)?/i;
const MIN_MB = 128;

function parseToMB(value: number, unit: string | undefined): number {
  const u = (unit ?? '').toUpperCase();
  if (u === 'G' || u === 'GB') return value * 1024;
  if (u === 'K' || u === 'KB') return value / 1024;
  if (u === 'M' || u === 'MB') return value;
  // No unit — assume bytes
  return value / (1024 * 1024);
}

export async function detectInnodbBufferPool(ctx: AuditContext): Promise<AuditFinding[]> {
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
      const match = BUFFER_POOL_PATTERN.exec(line);
      if (!match) continue;
      const numericValue = parseInt(match[1], 10);
      const unit = match[2];
      const valueMB = parseToMB(numericValue, unit);
      if (valueMB >= MIN_MB) continue;
      findings.push({
        severity: 'medium',
        title: 'innodb_buffer_pool_size is set too small',
        category: 'database:mysql:innodb-buffer-pool',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `\`innodb_buffer_pool_size\` controls how much data InnoDB caches in memory. ` +
          `A value below 128MB (detected: ${numericValue}${unit ?? ''} at line ${i + 1}) causes excessive disk I/O. ` +
          `Set this to 70-80% of available RAM to maximize cache hit ratio. ` +
          `For production servers with 8GB RAM, use at least \`innodb_buffer_pool_size=6G\`.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
