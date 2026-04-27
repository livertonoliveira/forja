import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, collectCssFiles, validateCwd } from '../utils.js';

const GOOGLE_FONTS = /fonts\.googleapis\.com/;
const PRECONNECT = /rel\s*=\s*['"]preconnect['"]/;
const FONT_FACE_BLOCK = /@font-face\s*\{[^}]*\}/gi;
const FONT_DISPLAY = /font-display\s*:/;

export async function detectFonts(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const allFiles = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const jsxFiles = allFiles.filter((f) => /\.[jt]sx$/.test(f));
  const cssFiles = collectCssFiles(ctx.cwd, ctx.abortSignal);
  const findings: AuditFinding[] = [];

  // Check JSX/TSX files for Google Fonts without preconnect
  for (const filePath of jsxFiles) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (GOOGLE_FONTS.test(content) && !PRECONNECT.test(content)) {
      findings.push({
        severity: 'medium',
        title: 'Google Fonts loaded without preconnect — increases font load latency',
        category: 'performance:fonts',
        filePath: relative(ctx.cwd, filePath),
        description:
          'Loading Google Fonts without a preconnect hint means the browser must establish a new connection ' +
          'before downloading the font, adding significant latency. Add <link rel="preconnect" href="https://fonts.googleapis.com" /> ' +
          'before the font stylesheet link.',
      });
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
          title: '@font-face missing font-display — may cause FOIT',
          category: 'performance:fonts',
          filePath: relative(ctx.cwd, filePath),
          line: lineNumber,
          description:
            '@font-face without font-display can cause Flash of Invisible Text (FOIT) where text is invisible ' +
            'while the custom font loads. Add "font-display: swap" or "font-display: optional" to control font rendering behavior.',
        });
        break; // one finding per file
      }
    }
  }

  return findings;
}
