import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectAppRouterFiles } from '../../utils.js';

const FETCH_CALL = /\bawait\s+fetch\s*\(/;
const DB_CALL = /\bawait\s+(?:prisma|db|orm|supabase|drizzle|client)\./;
const DATA_FETCH = new RegExp(`(?:${FETCH_CALL.source}|${DB_CALL.source})`);

const EXPLICIT_CACHE = [
  /export\s+const\s+revalidate\s*=/,
  /export\s+const\s+dynamic\s*=/,
  /cache\s*:\s*['"](?:force-cache|no-store)['"]/,
  /next\s*:\s*\{\s*revalidate/,
  /unstable_cache/,
  /generateStaticParams/,
];

export async function detectStaticPrerenderingGaps(ctx: AuditContext): Promise<AuditFinding[]> {
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

    if (!DATA_FETCH.test(content)) continue;

    const hasCacheConfig = EXPLICIT_CACHE.some((re) => re.test(content));
    if (hasCacheConfig) continue;

    const lineIndex = content.split('\n').findIndex((l) => DATA_FETCH.test(l));
    const line = lineIndex >= 0 ? lineIndex + 1 : undefined;

    findings.push({
      severity: 'medium',
      title: 'Data fetch without explicit cache configuration (static prerendering gap)',
      category: 'performance:static-prerendering-gaps',
      filePath: relative(ctx.cwd, filePath),
      ...(line !== undefined ? { line } : {}),
      description:
        `File performs data fetching without explicit cache configuration ` +
        `(\`export const revalidate\`, per-fetch \`cache\`/\`next.revalidate\`, or \`unstable_cache\`). ` +
        `Next.js App Router defaults changed in v14: unconfigured fetches in dynamic contexts opt into SSR. ` +
        `Add explicit caching to enable ISR/static generation and avoid accidental SSR on cacheable data.`,
    });
  }

  return findings;
}
