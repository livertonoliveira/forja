import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

const AGGREGATE_PATTERN = /\.aggregate\s*\(\s*\[/;
const EARLY_NON_MATCH_STAGE = /["']?\$(group|project|unwind|sort|limit|skip|bucket|facet|graphLookup)["']?\s*:/;
const MATCH_STAGE = /["']?\$match["']?\s*:/;
const FULL_COLLECTION_SCAN = /\.find\s*\(\s*\{\s*\}\s*\)/;

export async function detectCollectionScan(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);
  const srcDir = join(ctx.cwd, 'src');
  let files: string[];
  try {
    files = collectFiles(srcDir, ctx.abortSignal);
  } catch {
    return [];
  }
  const findings: AuditFinding[] = [];
  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (ctx.abortSignal.aborted) break;
      const line = lines[i];
      // Detect .find({}) — full collection scan
      if (FULL_COLLECTION_SCAN.test(line)) {
        findings.push({
          severity: 'high',
          title: 'Aggregation without early $match causes collection scan',
          category: 'database:mongodb:collection-scan',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `\`.find({})\` with an empty filter at line ${i + 1} causes a full collection scan. ` +
            `Unless pagination is applied immediately, this will load every document into memory. ` +
            `Add field selectors to filter documents server-side, or use \`.estimatedDocumentCount()\` ` +
            `if only a count is needed.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
        continue;
      }
      // Detect .aggregate([ without leading $match
      if (!AGGREGATE_PATTERN.test(line)) continue;
      // Scan the first 5 lines of the pipeline for the first stage
      const pipelineWindow = lines.slice(i + 1, i + 8).join('\n');
      const nonMatchIdx = EARLY_NON_MATCH_STAGE.exec(pipelineWindow)?.index ?? Infinity;
      const matchIdx = MATCH_STAGE.exec(pipelineWindow)?.index ?? Infinity;
      if (nonMatchIdx < matchIdx) {
        findings.push({
          severity: 'high',
          title: 'Aggregation without early $match causes collection scan',
          category: 'database:mongodb:collection-scan',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `An \`.aggregate()\` pipeline at line ${i + 1} starts with a non-\`$match\` stage ` +
            `(e.g. \`$group\`, \`$project\`, \`$unwind\`). Placing these stages before \`$match\` forces ` +
            `MongoDB to process the entire collection before filtering. Move \`$match\` to the first ` +
            `stage to allow index usage and reduce the number of documents processed downstream.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
