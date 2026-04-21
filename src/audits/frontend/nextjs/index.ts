import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { detectUseClientLeakage } from './heuristics/use-client-leakage.js';
import { detectMissingCacheConfig } from './heuristics/missing-cache-config.js';
import { detectRevalidationAntiPattern } from './heuristics/revalidation-anti-pattern.js';
import { detectMiddlewareBundleSize } from './heuristics/middleware-bundle-size.js';
import { detectStaticPrerenderingGaps } from './heuristics/static-prerendering-gaps.js';

export async function runNextjsAudit(ctx: AuditContext): Promise<AuditFinding[]> {
  const results = await Promise.all([
    detectUseClientLeakage(ctx),
    detectMissingCacheConfig(ctx),
    detectRevalidationAntiPattern(ctx),
    detectMiddlewareBundleSize(ctx),
    detectStaticPrerenderingGaps(ctx),
  ]);
  return results.flat();
}
