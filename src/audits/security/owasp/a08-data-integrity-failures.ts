import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const UNSAFE_DESERIALIZE_RE = /(?:deserialize|fromJSON|JSON\.parse)\s*\(\s*(?:req\.body|req\.query|body|query|input)/i;
const INSECURE_DOWNLOAD_RE = /(?:download|writeFile|pipe)\s*\([^)]*(?:req\.(?:query|params|body)\.(?:url|path|file|filename))/;

export async function detectDataIntegrityFailures(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (UNSAFE_DESERIALIZE_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Unsafe deserialization of user-supplied data', category: 'security:owasp:a08', filePath: rel, line: i + 1, description: `Line ${i + 1} deserializes user-controlled input without schema validation. Malicious payloads can trigger prototype pollution, code execution, or denial of service.`, cwe: 'CWE-502' });
      }
      if (INSECURE_DOWNLOAD_RE.test(line)) {
        findings.push({ severity: 'high', title: 'File download path derived from user input — path traversal risk', category: 'security:owasp:a08', filePath: rel, line: i + 1, description: `Line ${i + 1} uses a user-supplied path or filename for file operations without sanitization. An attacker can traverse directories to read or overwrite sensitive files.`, cwe: 'CWE-22', exploitVector: 'GET /download?file=../../etc/passwd' });
      }
    });
  }
  return findings;
}
