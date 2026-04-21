import { readFileSync } from 'node:fs';
import { relative, basename } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const STATIC_IMPORT = /^import\s+/gm;
const DYNAMIC_IMPORT = /React\.lazy\s*\(|import\s*\(/;
const REACT_DEFAULT_IMPORT = /import\s+React\s+from\s+['"]react['"]/;
const JSX_USAGE = /<[A-Za-z]/;

function isPageComponent(filePath: string): boolean {
  const name = basename(filePath);
  return (
    name === 'page.tsx' ||
    name === 'page.jsx' ||
    /Page\.[jt]sx$/.test(name) ||
    filePath.includes('/pages/')
  );
}

function countStaticImports(content: string): number {
  return (content.match(STATIC_IMPORT) ?? []).length;
}

export async function detectJavascript(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const allFiles = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const files = allFiles.filter((f) => /\.[jt]sx?$/.test(f));
  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    // Heuristic 1: Route/page components with many static imports and no code splitting
    if (isPageComponent(filePath)) {
      const importCount = countStaticImports(content);
      if (importCount > 5 && !DYNAMIC_IMPORT.test(content)) {
        findings.push({
          severity: 'low',
          title: 'Route component has no code splitting — consider React.lazy or dynamic import',
          category: 'performance:javascript',
          filePath: relative(ctx.cwd, filePath),
          description:
            `Route component has ${importCount} static imports with no code splitting. ` +
            'Large route components eagerly load all dependencies, increasing initial bundle size. ' +
            'Use React.lazy() or dynamic import() for heavy child components to enable code splitting.',
        });
      }
    }

    // Heuristic 2: Unused React import (imported but no JSX usage)
    if (REACT_DEFAULT_IMPORT.test(content) && !JSX_USAGE.test(content)) {
      findings.push({
        severity: 'low',
        title: 'Unused React import detected — tree-shaking may not eliminate it',
        category: 'performance:javascript',
        filePath: relative(ctx.cwd, filePath),
        description:
          'File imports React as a default import but does not appear to use JSX. ' +
          'With modern JSX transform (React 17+), the React import is no longer needed for JSX. ' +
          'Remove the unused import to reduce bundle size and avoid confusion.',
      });
    }
  }

  return findings;
}
