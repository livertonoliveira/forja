import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const IDOR_RE = /(?:findById|findOne|getById|findByPk)\s*\(\s*(?:req\.(?:params|query|body)\.|params\.|query\.|body\.)\w+/;
const MASS_ASSIGN_RE = /\.(?:create|update|save)\s*\(\s*(?:req\.body|body|dto)\s*\)/;
const ROUTE_REGISTRATION_RE = /router\.(?:get|post|put|delete|patch)\s*\(/i;
const AUTH_INDICATOR_RE = /(?:auth|guard|protect|verify|isAuth|requireAuth|authenticated|jwtAuth)/i;

export async function detectBrokenAccessControl(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (IDOR_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Potential IDOR — resource fetched by user-supplied ID without ownership check', category: 'security:owasp:a01', filePath: rel, line: i + 1, description: `Resource lookup at line ${i + 1} uses a user-supplied ID directly without verifying the requester owns or is authorized to access it. An attacker can enumerate or access other users' resources by changing the ID parameter.`, cwe: 'CWE-639', exploitVector: 'GET /resource/OTHER_USER_ID' });
      }
      if (MASS_ASSIGN_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Mass assignment — full request body passed to ORM without field allowlist', category: 'security:owasp:a01', filePath: rel, line: i + 1, description: `At line ${i + 1} the entire request body is passed directly to an ORM create/update call. An attacker can inject fields like "role", "isAdmin", or "companyId" to escalate privileges.`, cwe: 'CWE-915', exploitVector: 'POST /users {"role":"admin","email":"x@x.com"}' });
      }
    });
    if (ROUTE_REGISTRATION_RE.test(content) && !AUTH_INDICATOR_RE.test(content)) {
      findings.push({ severity: 'medium', title: 'Route registered without apparent authentication middleware', category: 'security:owasp:a01', filePath: rel, description: `A route in ${rel} appears to be registered without authentication middleware inline. Verify that authentication is applied globally or via a parent router.`, cwe: 'CWE-306' });
    }
  }
  return findings;
}
