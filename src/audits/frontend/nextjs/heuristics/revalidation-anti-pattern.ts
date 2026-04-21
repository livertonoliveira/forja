import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectAppRouterFiles } from '../../utils.js';

const ZERO_REVALIDATE = /export\s+const\s+revalidate\s*=\s*0\b/;
const LOW_REVALIDATE = /export\s+const\s+revalidate\s*=\s*([1-9]|10)\b/;
const REVALIDATE_ALL_PATHS = /revalidatePath\s*\(\s*['"]\/['"]\s*\)/;

export async function detectRevalidationAntiPattern(ctx: AuditContext): Promise<AuditFinding[]> {
  const files = collectAppRouterFiles(ctx);

  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (ZERO_REVALIDATE.test(content)) {
      findings.push({
        severity: 'medium',
        title: 'revalidate = 0 disables ISR (effectively force-dynamic)',
        category: 'performance:revalidation-anti-pattern',
        filePath: relative(ctx.cwd, filePath),
        description:
          `\`export const revalidate = 0\` opts the route into SSR on every request, ` +
          `eliminating any ISR caching benefit. If the page must be dynamic, use ` +
          `\`export const dynamic = 'force-dynamic'\` for explicit intent. ` +
          `If the data can be cached even briefly, set a positive revalidate value.`,
      });
      continue;
    }

    if (LOW_REVALIDATE.test(content)) {
      findings.push({
        severity: 'medium',
        title: 'ISR revalidate interval too low (≤ 10 seconds)',
        category: 'performance:revalidation-anti-pattern',
        filePath: relative(ctx.cwd, filePath),
        description:
          `\`export const revalidate\` is set to ≤ 10 seconds. This aggressive interval ` +
          `causes frequent cache invalidation, negating ISR benefits and increasing origin load. ` +
          `Consider raising the interval to match the actual data change frequency.`,
      });
      continue;
    }

    if (REVALIDATE_ALL_PATHS.test(content)) {
      findings.push({
        severity: 'medium',
        title: "revalidatePath('/') busts all cached routes on every mutation",
        category: 'performance:revalidation-anti-pattern',
        filePath: relative(ctx.cwd, filePath),
        description:
          `\`revalidatePath('/')\` invalidates the entire route cache on every call. ` +
          `This is rarely necessary and defeats the purpose of ISR. ` +
          `Prefer scoped invalidation: \`revalidatePath('/specific/path')\` or ` +
          `\`revalidateTag('data-tag')\` to limit the blast radius.`,
      });
    }
  }

  return findings;
}
