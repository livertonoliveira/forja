import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const PII_IN_LOG_RE = /(?:console|logger?|log)\s*\.(?:error|warn|info|debug|log)\s*\([^)]*(?:password|passwd|secret|token|ssn|creditCard|card_number|cvv|email)/i;
const SENSITIVE_RESPONSE_RE = /res\.(?:send|json)\s*\([^)]*(?:password|secret|token|hash|salt)\s*[,}]/i;

export async function detectLoggingMonitoring(ctx: AuditContext): Promise<AuditFinding[]> {
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
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (PII_IN_LOG_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Sensitive data (PII / credential) written to log', category: 'security:owasp:a09', filePath: rel, line: i + 1, description: `Line ${i + 1} logs a variable that appears to contain sensitive data (password, token, PII). This exposes credentials to log aggregation systems and violates GDPR/LGPD.`, cwe: 'CWE-532' });
      }
      if (SENSITIVE_RESPONSE_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Sensitive field (password/secret/hash) included in HTTP response body', category: 'security:owasp:a09', filePath: rel, line: i + 1, description: `Line ${i + 1} sends a response that appears to include a password, secret, or hash field. Sensitive fields must be stripped before sending responses to clients.`, cwe: 'CWE-200' });
      }
    });
  }
  return findings;
}
