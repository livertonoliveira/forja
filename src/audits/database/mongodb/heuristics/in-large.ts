import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFiles, validateCwd } from '../../../backend/utils.js';

const MAX_FINDINGS = 50;

// $in with more than 10 inline elements (commas as proxy)
const IN_LARGE_INLINE = /["']?\$in["']?\s*:\s*\[([^\]]{80,})\]/;
// $in used with a variable reference (potentially large dynamic list)
const IN_VARIABLE = /["']?\$in["']?\s*:\s*(?!\s*\[)(\w+)/;

export async function detectInLarge(ctx: AuditContext): Promise<AuditFinding[]> {
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
      const inlineMatch = IN_LARGE_INLINE.exec(line);
      if (inlineMatch) {
        // Count elements by commas
        const commaCount = (inlineMatch[1].match(/,/g) ?? []).length;
        if (commaCount >= 10) {
          findings.push({
            severity: 'medium',
            title: '$in operator with potentially large array (>1000 elements risk)',
            category: 'database:mongodb:in-large',
            filePath: relative(ctx.cwd, filePath),
            line: i + 1,
            description:
              `A \`$in\` operator with a large inline array (~${commaCount + 1} elements) was detected at line ${i + 1}. ` +
              `MongoDB converts \`$in\` arrays to a set scan; with thousands of elements this degrades to O(n) ` +
              `index lookups per query. Consider breaking the list into batches, using \`$or\` with indexed fields, ` +
              `or restructuring the data model to avoid large \`$in\` lists.`,
          });
          if (findings.length >= MAX_FINDINGS) break;
        }
        continue;
      }
      const varMatch = IN_VARIABLE.exec(line);
      if (varMatch) {
        findings.push({
          severity: 'medium',
          title: '$in operator with potentially large array (>1000 elements risk)',
          category: 'database:mongodb:in-large',
          filePath: relative(ctx.cwd, filePath),
          line: i + 1,
          description:
            `A \`$in\` operator referencing a variable (\`${varMatch[1]}\`) was detected at line ${i + 1}. ` +
            `If this variable is populated from user input or a database query it may grow unboundedly, ` +
            `causing performance degradation above ~1000 elements. Validate and cap the list size before ` +
            `executing the query, or restructure to avoid large \`$in\` lists.`,
        });
        if (findings.length >= MAX_FINDINGS) break;
      }
    }
    if (findings.length >= MAX_FINDINGS) break;
  }
  return findings;
}
