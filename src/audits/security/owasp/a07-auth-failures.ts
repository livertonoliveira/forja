import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const JWT_ALG_NONE_RE = /algorithm\s*[:=]\s*['"`]none['"`]/i;
const JWT_NO_EXP_RE = /sign\s*\([^)]+\)(?![^{]*expiresIn)/;
const JWT_WEAK_SECRET_RE = /(?:secret|jwtSecret|JWT_SECRET)\s*[:=]\s*['"`](?:secret|password|changeme|test|dev|jwt_secret|mysecret|1234)[^'"]*['"`]/i;
const SESSION_NO_REGEN_RE = /req\.session\.(?:user|userId|role)\s*=/;

export async function detectAuthFailures(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (JWT_ALG_NONE_RE.test(line)) {
        findings.push({ severity: 'critical', title: 'JWT accepts "none" algorithm — signature verification bypassed', category: 'security:owasp:a07', filePath: rel, line: i + 1, description: `algorithm: "none" at line ${i + 1} disables JWT signature verification entirely. An attacker can forge tokens without knowing the secret.`, cwe: 'CWE-347', exploitVector: 'jwt.sign({role:"admin"},""  ,{algorithm:"none"})' });
      }
      if (JWT_WEAK_SECRET_RE.test(line)) {
        findings.push({ severity: 'critical', title: 'Weak or predictable JWT secret', category: 'security:owasp:a07', filePath: rel, line: i + 1, description: `Line ${i + 1} uses a weak or default JWT secret. An attacker can brute-force the secret offline and forge tokens to impersonate any user.`, cwe: 'CWE-330', exploitVector: 'hashcat -a 0 -m 16500 <token> wordlist.txt' });
      }
      if (SESSION_NO_REGEN_RE.test(line)) {
        findings.push({ severity: 'medium', title: 'Session data set without session ID regeneration — session fixation risk', category: 'security:owasp:a07', filePath: rel, line: i + 1, description: `Session data is written at line ${i + 1} without calling req.session.regenerate(). Without regeneration after authentication, an attacker who pre-sets a session ID can hijack the session after the user logs in.`, cwe: 'CWE-384' });
      }
    });
  }
  return findings;
}
