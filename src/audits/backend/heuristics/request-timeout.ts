import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFiles, validateCwd } from '../utils.js';

const AXIOS_RE =
  /\baxios\s*\.\s*(?:get|post|put|patch|delete|request|head)\s*\(|\baxios\s*\(\s*\{/;
const FETCH_RE = /\bfetch\s*\(/;
const TIMEOUT_RE = /\btimeout\b|\bsignal\b.*AbortController|\bAbortSignal\.timeout/;

export async function detectMissingRequestTimeout(ctx: AuditContext): Promise<AuditFinding[]> {
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
      if (!AXIOS_RE.test(line) && !FETCH_RE.test(line)) continue;

      // Look ahead 10 lines for a timeout configuration
      const windowEnd = Math.min(lines.length, i + 11);
      const window = lines.slice(i, windowEnd).join('\n');

      if (TIMEOUT_RE.test(window)) continue;

      const method = AXIOS_RE.test(line) ? 'axios' : 'fetch';
      findings.push({
        severity: 'medium',
        title: 'HTTP request without timeout',
        category: 'performance:missing-request-timeout',
        filePath: relative(ctx.cwd, filePath),
        line: i + 1,
        description:
          `An ${method} HTTP request at line ${i + 1} has no timeout configured. ` +
          `Without a timeout, the request can hang indefinitely if the upstream server is slow or ` +
          `unresponsive, exhausting connection pools and causing cascading failures. ` +
          `For axios, add \`{ timeout: 5000 }\` to the config object. ` +
          `For fetch, use \`signal: AbortSignal.timeout(5000)\` in the options.`,
      });
    }
  }

  return findings;
}
