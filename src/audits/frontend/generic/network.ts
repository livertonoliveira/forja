import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const AWAIT_FETCH = /\bawait\s+fetch\s*\(/g;
const PROMISE_ALL = /Promise\.all\s*\(/;

export async function detectNetwork(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const files = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const awaitFetchMatches = content.match(AWAIT_FETCH);
    const awaitFetchCount = awaitFetchMatches?.length ?? 0;

    if (awaitFetchCount >= 2 && !PROMISE_ALL.test(content)) {
      findings.push({
        severity: 'medium',
        title: 'Sequential fetch calls detected — use Promise.all to parallelize requests',
        category: 'performance:network',
        filePath: relative(ctx.cwd, filePath),
        description:
          `File contains ${awaitFetchCount} sequential "await fetch()" calls without Promise.all. ` +
          'Sequential requests add their latencies together (e.g., 2 x 200ms = 400ms). ' +
          'Use Promise.all([fetch(urlA), fetch(urlB)]) to make requests in parallel and reduce total wait time.',
      });
    }
  }

  return findings;
}
