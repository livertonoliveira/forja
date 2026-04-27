import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateUpgradeGuide } from '../validate-upgrade-guide.ts';

function tmpFile(content: string): string {
  const file = path.join(os.tmpdir(), `upgrade-guide-test-${Date.now()}.md`);
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

describe('validateUpgradeGuide', () => {
  it('returns error when file does not exist', () => {
    const result = validateUpgradeGuide('/nonexistent/path/v9.9.md');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not found/i);
  });

  it('returns error for template with unfilled placeholder "- ..."', () => {
    const file = tmpFile('## What\'s new\n\n- ...\n\n## Breaking changes\n\n- No changes.\n');
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/placeholder/i);
  });

  it('returns error for template with bare "..." line', () => {
    const file = tmpFile('## Migration steps\n\n...\n');
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/placeholder/i);
  });

  it('returns ok for a fully filled guide', () => {
    const file = tmpFile(
      '## What\'s new\n\n- Added plugin system\n\n## Breaking changes\n\n- None.\n\n## Migration steps\n\n1. Run forja migrate\n'
    );
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(true);
  });

  it('returns ok when "..." appears inside longer text', () => {
    const file = tmpFile('## Notes\n\n- See docs for more...\n\n- Another item.\n');
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(true);
  });

  it('returns error for numbered list placeholder "3. ..."', () => {
    const file = tmpFile('## Migration steps\n\n1. Run forja migrate\n2. Update config\n3. ...\n');
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/placeholder/i);
  });

  it('returns error for indented placeholder "  ..."', () => {
    const file = tmpFile('## Section\n\n  ...\n');
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/placeholder/i);
  });

  it('returns error for blockquote key-value placeholder "> - key: ..."', () => {
    const file = tmpFile('> - PR breaking changes: ...\n');
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/placeholder/i);
  });

  it('returns ok when "..." is embedded in a backtick command', () => {
    const file = tmpFile('## Steps\n\n1. Run `forja migrate ...`\n');
    const result = validateUpgradeGuide(file);
    expect(result.ok).toBe(true);
  });
});
