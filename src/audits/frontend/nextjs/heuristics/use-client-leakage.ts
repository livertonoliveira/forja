import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectAppRouterFiles } from '../../utils.js';

const USE_CLIENT_DIRECTIVE = /^['"]use client['"]/m;
const INTERACTIVE_SIGNALS =
  /\b(?:useState|useEffect|useRef|useCallback|useReducer|useContext|onClick|onChange|onSubmit|onInput|onKeyDown|onKeyUp|onMouseOver|onFocus|onBlur)\b/;

export async function detectUseClientLeakage(ctx: AuditContext): Promise<AuditFinding[]> {
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

    if (!USE_CLIENT_DIRECTIVE.test(content)) continue;
    if (INTERACTIVE_SIGNALS.test(content)) continue;

    findings.push({
      severity: 'medium',
      title: '"use client" on component with no interactivity',
      category: 'performance:use-client-leakage',
      filePath: relative(ctx.cwd, filePath),
      description:
        `File declares "use client" but contains no React hooks or DOM event handlers. ` +
        `This unnecessarily pushes the component and its entire subtree to the client bundle. ` +
        `Remove "use client" or move interactivity to a leaf child component.`,
    });
  }

  return findings;
}
