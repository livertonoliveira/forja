import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectCssFiles, validateCwd } from '../utils.js';

const UNIVERSAL_SELECTOR = /\*\s*\{/;
const DEEP_NESTING = /\w[\w\s.-]*\s+\w[\w\s.-]*\s+\w[\w\s.-]*\s+\w[\w\s.-]*\s*\{/;

export async function detectCss(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const cssFiles = collectCssFiles(ctx.cwd, ctx.abortSignal);
  const findings: AuditFinding[] = [];

  for (const filePath of cssFiles) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (UNIVERSAL_SELECTOR.test(content)) {
      findings.push({
        severity: 'low',
        title: 'Universal CSS selector (*) detected — may cause expensive style recalculations',
        category: 'performance:css',
        filePath: relative(ctx.cwd, filePath),
        description:
          'The universal selector (*) matches every element in the DOM, causing the browser to evaluate ' +
          'styles for all elements. This can cause expensive style recalculations, especially in large DOM trees. ' +
          'Scope styles to specific elements or use more targeted selectors.',
      });
    }

    if (DEEP_NESTING.test(content)) {
      findings.push({
        severity: 'low',
        title: 'Deeply nested CSS selector (4+ levels) — increases selector matching cost',
        category: 'performance:css',
        filePath: relative(ctx.cwd, filePath),
        description:
          'Deeply nested CSS selectors (4+ levels) increase the cost of selector matching as the browser ' +
          'must traverse more of the DOM tree to match elements. Flatten your CSS hierarchy or use BEM methodology ' +
          'to keep selectors shallow and performant.',
      });
    }
  }

  return findings;
}
