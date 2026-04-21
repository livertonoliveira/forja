import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../utils.js';

const LOG_RE = /(?:console|logger?|log)[ \t]{0,10}\.[ \t]{0,10}(?:error|warn|info|debug)[ \t]{0,10}\(/i;
const SECRET_RE =
  /\b(?:password|passwd|secret|token|apiKey|api_key|credential|auth_token|authToken|private_key|privateKey|bearer)\b/i;

export async function detectSecretLeaks(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!LOG_RE.test(line)) continue;

      // Check window: 2 lines before through 3 lines after
      const windowStart = Math.max(0, i - 2);
      const windowEnd = Math.min(lines.length, i + 4);
      const window = lines.slice(windowStart, windowEnd).join('\n');

      if (!SECRET_RE.test(window)) continue;

      findings.push({
        severity: 'high',
        title: 'Potential secret value in error log',
        category: 'security:secret-leaks',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `A log statement at line ${i + 1} appears to log a variable whose name suggests it contains ` +
          `sensitive data (e.g. password, token, secret, apiKey). Logging secret-named variables ` +
          `exposes sensitive data to log aggregation systems, may violate compliance requirements ` +
          `(PCI-DSS, GDPR), and can be exfiltrated by anyone with log access. ` +
          `Log only non-sensitive context such as user IDs or error messages, never credential values.`,
      });
    }
  }

  return findings;
}
