import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectAppRouterFiles } from '../../utils.js';

const ROUTE_HANDLER = /export\s+async\s+function\s+(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/;
const CACHE_CONFIGS = [
  /export\s+const\s+dynamic\s*=/,
  /export\s+const\s+revalidate\s*=/,
  /cache\s*:\s*['"](?:force-cache|no-store)['"]/,
  /next\s*:\s*\{\s*revalidate/,
  /unstable_cache/,
];

export async function detectMissingCacheConfig(ctx: AuditContext): Promise<AuditFinding[]> {
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

    if (!ROUTE_HANDLER.test(content)) continue;

    const hasCacheConfig = CACHE_CONFIGS.some((re) => re.test(content));
    if (hasCacheConfig) continue;

    const match = ROUTE_HANDLER.exec(content);
    const method = match?.[0].match(/GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS/)?.[0] ?? 'unknown';

    findings.push({
      severity: 'medium',
      title: `Route handler ${method} missing cache configuration`,
      category: 'performance:missing-cache-config',
      filePath: relative(ctx.cwd, filePath),
      description:
        `Route handler \`${method}\` has no explicit cache configuration (\`export const revalidate\`, ` +
        `\`export const dynamic\`, or per-fetch \`cache\`/\`next.revalidate\` options). ` +
        `Next.js defaults vary by version and context. Add explicit cache config to avoid ` +
        `unintended SSR on cacheable data or stale responses on dynamic data.`,
    });
  }

  return findings;
}
