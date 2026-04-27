import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../backend/utils.js';

const SQL_INJECT_RE = /(?:query|execute|raw)\s*\(\s*[`'"`][^`'"]+\$\{|(?:query|execute|raw)\s*\(\s*['"`][^'"]+\+\s*(?:req\.|params\.|query\.|body\.)/;
const NOSQL_INJECT_RE = /(?:find|findOne|findById|aggregate|updateOne|deleteOne)\s*\(\s*\{[^}]*(?:req\.body|req\.query|req\.params)\./;
const CMD_INJECT_RE = /(?:exec|execSync|spawn|spawnSync)\s*\(\s*(?:[`'"`][^`'"]+\$\{|.*(?:req\.|params\.|query\.|body\.))/;
const EVAL_RE = /\beval\s*\(/;
const XSS_RE = /dangerouslySetInnerHTML\s*=\s*\{\s*\{|\.innerHTML\s*=\s*(?!['"`])/;

export async function detectInjection(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (SQL_INJECT_RE.test(line)) {
        findings.push({ severity: 'critical', title: 'SQL Injection — user input interpolated into raw query', category: 'security:owasp:a03', filePath: rel, line: i + 1, description: `Line ${i + 1} constructs a SQL query via string interpolation or concatenation with user-controlled input. Use parameterized queries or a prepared statement.`, cwe: 'CWE-89', exploitVector: "'; DROP TABLE users; --" });
      }
      if (NOSQL_INJECT_RE.test(line)) {
        findings.push({ severity: 'critical', title: 'NoSQL Injection — user input passed directly to query operator', category: 'security:owasp:a03', filePath: rel, line: i + 1, description: `Line ${i + 1} passes a user-controlled object directly to a MongoDB operator. An attacker can inject operators like {"$gt":""} to bypass authentication or access unauthorized data.`, cwe: 'CWE-943', exploitVector: 'POST /login {"username":{"$gt":""},"password":{"$gt":""}}' });
      }
      if (CMD_INJECT_RE.test(line)) {
        findings.push({ severity: 'critical', title: 'Command Injection — user input passed to shell execution', category: 'security:owasp:a03', filePath: rel, line: i + 1, description: `Line ${i + 1} passes user-controlled input to a shell command. An attacker can inject arbitrary OS commands.`, cwe: 'CWE-78', exploitVector: 'filename="; cat /etc/passwd"' });
      }
      if (EVAL_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Use of eval() — potential code injection', category: 'security:owasp:a03', filePath: rel, line: i + 1, description: `eval() at line ${i + 1} executes arbitrary JavaScript. If user-controlled input reaches eval(), an attacker can execute arbitrary code on the server.`, cwe: 'CWE-95' });
      }
      if (XSS_RE.test(line)) {
        findings.push({ severity: 'high', title: 'Cross-Site Scripting (XSS) — unescaped output to DOM', category: 'security:owasp:a03', filePath: rel, line: i + 1, description: `Line ${i + 1} sets innerHTML or uses dangerouslySetInnerHTML without sanitization. An attacker can inject malicious scripts that execute in victims' browsers.`, cwe: 'CWE-79', exploitVector: '<img src=x onerror=alert(document.cookie)>' });
      }
    });
  }
  return findings;
}
