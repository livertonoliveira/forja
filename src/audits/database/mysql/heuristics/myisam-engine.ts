import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const MYISAM_PATTERN = /ENGINE\s*=\s*MyISAM/i;

export async function detectMyisamEngine(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!MYISAM_PATTERN.test(line)) continue;
      findings.push({
        severity: 'high',
        title: 'Table uses deprecated MyISAM storage engine',
        category: 'database:mysql:myisam-engine',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `MyISAM is deprecated and does not support transactions, foreign keys, or row-level locking. ` +
          `Detected \`ENGINE=MyISAM\` at line ${i + 1}. ` +
          `Migrate to InnoDB by changing the DDL to \`ENGINE=InnoDB\`. ` +
          `InnoDB provides ACID compliance, crash recovery, row-level locking, and foreign key support.`,
      });
      if (findings.length >= MAX_FINDINGS) break;
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
