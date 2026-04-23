import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const WEAK_HASH_RE = /(?:createHash|md5|sha1|sha256)\s*\(\s*['"`](?:md5|sha1|sha256)['"`]/i;
const WEAK_BCRYPT_RE = /bcrypt\.(?:hash|genSalt)\s*\([^,)]+,\s*([1-9])\s*\)/;
const HARDCODED_SECRET_RE = /(?:secret|password|token|key|api_?key)\s*[:=]\s*['"`][A-Za-z0-9/+]{8,}['"`]/i;
// eslint-disable-next-line no-useless-escape
const HTTP_URL_RE = /['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"`]+['"`]/;

export async function detectCryptographicFailures(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (WEAK_HASH_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Weak cryptographic hash function (MD5 / SHA-1 / SHA-256 without salt)', category: 'security:owasp:a02', filePath: rel, line: i + 1, description: `Line ${i + 1} uses a weak hash function. MD5 and SHA-1 are broken for security use; SHA-256 alone is insufficient for password hashing. Use bcrypt, scrypt, or Argon2 for passwords.`, cwe: 'CWE-916' });
      }
      const bcryptMatch = WEAK_BCRYPT_RE.exec(line);
      if (bcryptMatch && parseInt(bcryptMatch[1], 10) < 10) {
        findings.push({ severity: 'medium', title: 'bcrypt work factor too low (< 10 rounds)', category: 'security:owasp:a02', filePath: rel, line: i + 1, description: `bcrypt at line ${i + 1} uses fewer than 10 rounds. The OWASP recommendation is ≥10 rounds to resist brute-force attacks.`, cwe: 'CWE-916' });
      }
      if (HARDCODED_SECRET_RE.test(line)) {
        findings.push({ severity: 'critical', title: 'Hardcoded secret / credential detected', category: 'security:owasp:a02', filePath: rel, line: i + 1, description: `A hardcoded secret or credential was found at line ${i + 1}. Secrets must be stored in environment variables or a secrets manager, never in source code.`, cwe: 'CWE-798', exploitVector: 'grep -r "secret|password|token" src/' });
      }
      if (HTTP_URL_RE.test(line)) {
        findings.push({ severity: 'medium', title: 'Plaintext HTTP endpoint used for external communication', category: 'security:owasp:a02', filePath: rel, line: i + 1, description: `Line ${i + 1} references an http:// URL for a non-localhost host. Data transmitted over HTTP is unencrypted and susceptible to interception. Use HTTPS.`, cwe: 'CWE-319' });
      }
    });
  }
  return findings;
}
