import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const NO_RATE_LIMIT_RE = /router\.(?:post|put|patch)\s*\(\s*['"`]\/(?:login|register|forgot|reset|auth|signup|password)[^'"]*['"`]/i;
const UNLIMITED_RESOURCE_RE = /\.find\s*\(\s*(?:\{\s*\}|)\s*\)(?!\s*\.limit\s*\()/;

export async function detectInsecureDesign(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const srcDir = join(ctx.cwd, 'src');
  let files: string[];
  try { files = collectFiles(srcDir, ctx.abortSignal); } catch { return []; }

  const findings: AuditFinding[] = [];
  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;
    let content: string;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }
    const rel = relative(ctx.cwd, filePath);
    const hasRateLimit = /rateLimit|throttle|limiter/i.test(content);
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (NO_RATE_LIMIT_RE.test(line) && !hasRateLimit) {
        findings.push({ severity: 'medium', title: 'Authentication endpoint without rate limiting', category: 'security:owasp:a04', filePath: rel, line: i + 1, description: `The route at line ${i + 1} handles authentication but no rate limiting was detected in this file. Without rate limiting, brute-force attacks can enumerate valid credentials.`, cwe: 'CWE-307' });
      }
      if (UNLIMITED_RESOURCE_RE.test(line)) {
        findings.push({ severity: 'medium', title: 'Unbounded query — collection fetched without pagination limit', category: 'security:owasp:a04', filePath: rel, line: i + 1, description: `Line ${i + 1} fetches a collection without a .limit() clause. An attacker or accidental large dataset can cause memory exhaustion or denial of service.`, cwe: 'CWE-400' });
      }
    });
  }
  return findings;
}
