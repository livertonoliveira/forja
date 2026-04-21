import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const IMG_TAG = /<img\b[^>]*>/gi;
const LAZY_LOADING = /\bloading\s*=\s*['"]lazy['"]/;
const LEGACY_SRC = /\bsrc\s*=\s*['"][^'"]*\.(?:png|jpg|jpeg)['"]/i;

export async function detectImages(ctx: AuditContext): Promise<AuditFinding[]> {
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

    let foundMissingLazy = false;
    let foundLegacyFormat = false;

    const matches = content.matchAll(IMG_TAG);
    for (const match of matches) {
      const tag = match[0];

      if (!foundMissingLazy && !LAZY_LOADING.test(tag)) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        findings.push({
          severity: 'low',
          title: 'Image missing loading="lazy" — may delay Time to Interactive',
          category: 'performance:images',
          filePath: relative(ctx.cwd, filePath),
          line: lineNumber,
          description:
            'Images without loading="lazy" are eagerly loaded, which can delay Time to Interactive (TTI) ' +
            'by consuming bandwidth needed for critical resources. Add loading="lazy" to off-screen images.',
        });
        foundMissingLazy = true;
      }

      if (!foundLegacyFormat && LEGACY_SRC.test(tag)) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        findings.push({
          severity: 'low',
          title: 'Image uses legacy format (PNG/JPG) — consider WebP or AVIF',
          category: 'performance:images',
          filePath: relative(ctx.cwd, filePath),
          line: lineNumber,
          description:
            'PNG and JPG images have larger file sizes compared to modern formats. ' +
            'WebP offers ~30% smaller files than JPEG at equivalent quality; AVIF offers even better compression. ' +
            'Convert images to WebP or AVIF to reduce page weight.',
        });
        foundLegacyFormat = true;
      }

      if (foundMissingLazy && foundLegacyFormat) break;
    }
  }

  return findings;
}
