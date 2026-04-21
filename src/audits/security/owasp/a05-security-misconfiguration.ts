import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const CORS_WILDCARD_RE = /(?:origin|Access-Control-Allow-Origin)\s*[:=]\s*['"`]\*['"`]/;
const DEBUG_ENABLED_RE = /(?:debug|DEBUG)\s*[:=]\s*true/;
const STACK_TRACE_RE = /res\.(?:send|json)\s*\([^)]*(?:err\.stack|error\.stack|e\.stack)/;
const MISSING_HELMET_RE = /express\s*\(\s*\)/;

export async function detectSecurityMisconfiguration(ctx: AuditContext): Promise<AuditFinding[]> {
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
    const hasHelmet = /helmet/i.test(content);
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (CORS_WILDCARD_RE.test(line)) {
        findings.push({ severity: 'high', title: 'CORS wildcard origin — credentials may be exposed to any domain', category: 'security:owasp:a05', filePath: rel, line: i + 1, description: `CORS is configured with Access-Control-Allow-Origin: * at line ${i + 1}. If credentials are also enabled, this is a critical misconfiguration. Restrict origins to known domains.`, cwe: 'CWE-942' });
      }
      if (DEBUG_ENABLED_RE.test(line)) {
        findings.push({ severity: 'medium', title: 'Debug mode enabled in configuration', category: 'security:owasp:a05', filePath: rel, line: i + 1, description: `Debug mode is hardcoded to true at line ${i + 1}. Debug output may expose stack traces, internal state, or credentials in production.`, cwe: 'CWE-489' });
      }
      if (STACK_TRACE_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Stack trace exposed in HTTP response', category: 'security:owasp:a05', filePath: rel, line: i + 1, description: `Line ${i + 1} sends err.stack directly to the client. Stack traces reveal internal file paths, library versions, and code structure that aid attackers.`, cwe: 'CWE-209' });
      }
      if (MISSING_HELMET_RE.test(line) && !hasHelmet) {
        findings.push({ severity: 'medium', title: 'Express app created without Helmet security headers middleware', category: 'security:owasp:a05', filePath: rel, line: i + 1, description: `An Express app is instantiated at line ${i + 1} but helmet() was not found in this file. Helmet sets security headers (X-Frame-Options, CSP, HSTS, etc.) that mitigate common web attacks.`, cwe: 'CWE-693' });
      }
    });
  }
  return findings;
}
