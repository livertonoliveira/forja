import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, collectCssFiles, validateCwd } from '../utils.js';

const IMG_TAG = /<img\b[^>]*>/gi;
const WIDTH_ATTR = /\bwidth\s*=/;
const HEIGHT_ATTR = /\bheight\s*=/;
const FONT_FACE_BLOCK = /@font-face\s*\{[^}]*\}/gi;
const FONT_DISPLAY = /font-display\s*:/;

export async function detectCls(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const allFiles = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const jsxFiles = allFiles.filter((f) => /\.[jt]sx$/.test(f));
  const cssFiles = collectCssFiles(ctx.cwd, ctx.abortSignal);
  const findings: AuditFinding[] = [];

  // Check JSX files for img without width/height
  for (const filePath of jsxFiles) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const matches = content.matchAll(IMG_TAG);
    for (const match of matches) {
      const tag = match[0];
      if (!WIDTH_ATTR.test(tag) || !HEIGHT_ATTR.test(tag)) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        findings.push({
          severity: 'medium',
          title: 'Image missing width/height — may cause Cumulative Layout Shift',
          category: 'performance:cls',
          filePath: relative(ctx.cwd, filePath),
          line: lineNumber,
          description:
            'Images without explicit width and height attributes cause the browser to not reserve space, ' +
            'leading to layout shifts as the image loads. Add width and height attributes to prevent CLS.',
        });
        break; // one finding per file
      }
    }
  }

  // Check CSS files for @font-face without font-display
  for (const filePath of cssFiles) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const matches = content.matchAll(FONT_FACE_BLOCK);
    for (const match of matches) {
      const block = match[0];
      if (!FONT_DISPLAY.test(block)) {
        const lineNumber = content.slice(0, match.index).split('\n').length;
        findings.push({
          severity: 'medium',
          title: '@font-face without font-display: swap — may cause layout shift',
          category: 'performance:cls',
          filePath: relative(ctx.cwd, filePath),
          line: lineNumber,
          description:
            '@font-face blocks without font-display can cause Flash of Invisible Text (FOIT) or layout shifts. ' +
            'Add "font-display: swap" to ensure text remains visible while the font loads.',
        });
        break; // one finding per file
      }
    }
  }

  return findings;
}
