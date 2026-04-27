import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const SSRF_FETCH_RE = /(?:fetch|axios\.get|axios\.post|http\.get|https\.get|request)\s*\(\s*(?:req\.(?:body|query|params)\.|body\.|query\.|params\.)\w+/;
const SSRF_TEMPLATE_RE = /(?:fetch|axios\.(?:get|post|request))\s*\(\s*[`'"`][^`'"]+\$\{(?:req\.|body\.|query\.|params\.)/;

export async function detectSSRF(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (SSRF_FETCH_RE.test(line) || SSRF_TEMPLATE_RE.test(line)) {
        findings.push({ severity: 'high', title: 'SSRF — HTTP request made to user-controlled URL', category: 'security:owasp:a10', filePath: rel, line: i + 1, description: `Line ${i + 1} makes an HTTP request to a URL derived from user input. An attacker can target internal services (AWS metadata endpoint, internal APIs, localhost) to exfiltrate data or perform lateral movement.`, cwe: 'CWE-918', exploitVector: 'GET /fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/' });
      }
    });
  }
  return findings;
}
