import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const SCRIPT_TAG = /<script\b[^>]*>/gi;
const ASYNC_OR_DEFER = /\b(?:async|defer)\b/;
const INLINE_EVENT_HANDLER = /\b(?:onclick|onload)\s*=/;

export async function detectThirdPartyScripts(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const allFiles = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const files = allFiles.filter((f) => /\.[jt]sx$/.test(f));
  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    // Heuristic 1: <script> without async or defer
    const scriptMatches = content.matchAll(SCRIPT_TAG);
    for (const match of scriptMatches) {
      const tag = match[0];
      if (!ASYNC_OR_DEFER.test(tag)) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        findings.push({
          severity: 'high',
          title: '<script> tag without async or defer — blocks page rendering',
          category: 'performance:third-party-scripts',
          filePath: relative(ctx.cwd, filePath),
          line: lineNumber,
          description:
            'A <script> tag without async or defer blocks HTML parsing and page rendering until the script ' +
            'is downloaded and executed. Add async (for independent scripts) or defer (for scripts that need DOM) ' +
            'to prevent render blocking.',
        });
        break; // one finding per file
      }
    }

    // Heuristic 2: Inline HTML event handlers (lowercase onclick/onload)
    if (INLINE_EVENT_HANDLER.test(content)) {
      findings.push({
        severity: 'medium',
        title: 'Inline HTML event handler detected — prefer React synthetic events',
        category: 'performance:third-party-scripts',
        filePath: relative(ctx.cwd, filePath),
        description:
          'Lowercase inline event handlers (onclick=, onload=) are HTML-style attributes not native to React. ' +
          'They bypass React\'s synthetic event system and may not work as expected. ' +
          'Use React\'s camelCase event handlers (onClick, onLoad) instead.',
      });
    }

  }

  return findings;
}
