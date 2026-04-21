import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../utils.js';

const SYNC_IO_RE =
  /\b(?:readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync|readdirSync|statSync|lstatSync|unlinkSync|copyFileSync|renameSync|execSync|spawnSync|chmodSync)\s*\(/;
const ASYNC_CTX_RE = /\basync\s+(?:function|\(|[a-zA-Z_$])/;

export async function detectBlockingIO(ctx: AuditContext): Promise<AuditFinding[]> {
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
      const line = lines[i];
      if (!SYNC_IO_RE.test(line)) continue;

      // Look back 30 lines (or to beginning of file) for an async context
      const windowStart = Math.max(0, i - 30);
      const window = lines.slice(windowStart, i + 1).join('\n');
      if (!ASYNC_CTX_RE.test(window)) continue;

      findings.push({
        severity: 'medium',
        title: 'Synchronous I/O inside async handler',
        category: 'performance:blocking-io',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `Synchronous I/O call detected inside an async context at line ${i + 1}. ` +
          `Sync I/O (e.g. readFileSync, execSync) blocks the Node.js event loop for the entire ` +
          `duration of the operation, preventing other requests from being processed. ` +
          `Replace with the async equivalent (e.g. fs.promises.readFile, exec from node:child_process).`,
      });
    }
  }

  return findings;
}
