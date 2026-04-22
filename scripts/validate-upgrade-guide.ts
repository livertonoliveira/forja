import * as fs from 'fs';

export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validates an upgrade guide file.
 *
 * Checks:
 * 1. The file exists.
 * 2. No line consists solely of `...` (unfilled placeholder detection), including
 *    variants like `- ...`, `3. ...`, `> - key: ...`, and indented `  ...`.
 *    A line is a placeholder when its entire meaningful content resolves to `...`
 *    after stripping blockquote/list markers and optional key-value labels.
 */
export function validateUpgradeGuide(filePath: string): ValidationResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: `Upgrade guide not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  // Matches lines whose content is just `...` after optional:
  //   - leading whitespace and blockquote/list markers (>, -, *)
  //   - a numbered-list prefix (N.)
  //   - a key-value label with no dots (e.g. "PR breaking changes: ")
  const placeholderPattern = /^[\s>*-]*(\d+\.\s*)?([^.]+:\s*)?\.\.\.\s*$/;

  for (let i = 0; i < lines.length; i++) {
    if (placeholderPattern.test(lines[i])) {
      return {
        ok: false,
        reason: `Placeholder found on line ${i + 1}: "${lines[i].trim()}" — fill in all placeholders before releasing.`,
      };
    }
  }

  return { ok: true };
}
