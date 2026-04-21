import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../utils.js';

const MOMENT_IMPORT = /import\s+[^;]+\s+from\s+['"]moment['"]/;
const LODASH_MONOLITH_IMPORT = /import\s+[^;]+\s+from\s+['"]lodash['"]/;

export async function detectBundleSize(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const files = collectFrontendFiles(ctx.cwd, ctx.abortSignal);
  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    if (MOMENT_IMPORT.test(content)) {
      findings.push({
        severity: 'medium',
        title: 'Heavy library "moment" detected — prefer date-fns or dayjs',
        category: 'performance:bundle-size',
        filePath: relative(ctx.cwd, filePath),
        description:
          'The "moment" library is heavy (~300 KB minified) and includes unused locale data. ' +
          'Replace with date-fns (tree-shakeable) or dayjs (2 KB) to significantly reduce bundle size.',
      });
    }

    if (LODASH_MONOLITH_IMPORT.test(content)) {
      findings.push({
        severity: 'medium',
        title: 'Lodash imported as monolith — prefer lodash-es or native alternatives',
        category: 'performance:bundle-size',
        filePath: relative(ctx.cwd, filePath),
        description:
          'Importing from "lodash" includes the entire library in the bundle (~70 KB). ' +
          'Use lodash-es for tree-shaking, import specific methods (lodash/merge), or use native ES alternatives.',
      });
    }
  }

  return findings;
}
