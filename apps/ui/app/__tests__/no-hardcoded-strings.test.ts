/**
 * Static analysis test: no hardcoded Portuguese strings in TSX source files.
 * (MOB-1106 — i18n extraction acceptance criterion)
 *
 * What it checks:
 *   1. All .tsx files under apps/ui/app/** and apps/ui/components/**
 *      must NOT contain Portuguese accented characters (ã õ ê é á ó ú â ô ç í à)
 *      directly in code — they must be in message JSON files only.
 *   2. en.json and pt-BR.json must exist and share identical top-level key sets.
 *   3. en.json and pt-BR.json must share identical nested key sets (structural symmetry).
 *
 * Exclusions:
 *   - Lines that are pure single-line comments (// ...)
 *   - Files that are test files (*.test.tsx, *.spec.tsx)
 *   - Files that are Storybook stories (*.stories.tsx)
 *   - Lines inside block comment regions (/* ... *\/\)
 *
 * Run from monorepo root:
 *   npx vitest run --pool=threads apps/ui/app/__tests__/no-hardcoded-strings.test.ts
 *
 * Run from apps/ui/:
 *   npx vitest run app/__tests__/no-hardcoded-strings.test.ts
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all files matching the given extension. */
function collectFiles(dir: string, ext: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, ext, results);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

/** Collect all leaf keys from a nested object as dot-separated paths. */
function collectLeafKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    collectLeafKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

// Portuguese accented characters regex — any of: ã õ ê é á ó ú â ô ç í à Ã Õ Ê É Á Ó Ú Â Ô Ç Í À
const PT_ACCENT_RE = /[ãõêéáóúâôçíàÃÕÊÉÁÓÚÂÔÇÍÀ]/;

// ---------------------------------------------------------------------------
// Resolve paths relative to this file (works from any cwd)
// ---------------------------------------------------------------------------

const UI_ROOT = path.resolve(__dirname, '..', '..');
const APP_DIR = path.join(UI_ROOT, 'app');
const COMPONENTS_DIR = path.join(UI_ROOT, 'components');
const MESSAGES_DIR = path.join(UI_ROOT, 'messages');

// ---------------------------------------------------------------------------
// Test: no hardcoded Portuguese strings in source TSX files
// ---------------------------------------------------------------------------

describe('i18n: no hardcoded Portuguese strings in .tsx source files', () => {
  it('collects .tsx files from app/ and components/ directories', () => {
    const appFiles = collectFiles(APP_DIR, '.tsx');
    const compFiles = collectFiles(COMPONENTS_DIR, '.tsx');
    const total = appFiles.length + compFiles.length;
    // Sanity: we should find at least 10 TSX files
    expect(total).toBeGreaterThan(10);
  });

  it('finds zero lines with Portuguese accented chars in non-test, non-story TSX files', () => {
    const allFiles = [
      ...collectFiles(APP_DIR, '.tsx'),
      ...collectFiles(COMPONENTS_DIR, '.tsx'),
    ].filter((f) => {
      const base = path.basename(f);
      // Exclude test files and Storybook stories
      return (
        !base.endsWith('.test.tsx') &&
        !base.endsWith('.spec.tsx') &&
        !base.endsWith('.stories.tsx')
      );
    });

    const violations: Array<{ file: string; line: number; content: string }> = [];

    for (const filePath of allFiles) {
      const source = fs.readFileSync(filePath, 'utf-8');
      const lines = source.split('\n');
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];

        // Track block comment boundaries
        if (inBlockComment) {
          if (raw.includes('*/')) inBlockComment = false;
          continue;
        }
        if (raw.includes('/*')) {
          inBlockComment = true;
          // The same line might also close: /* ... */ — handle inline block comments
          const afterOpen = raw.slice(raw.indexOf('/*') + 2);
          if (afterOpen.includes('*/')) inBlockComment = false;
          continue;
        }

        // Strip inline single-line comments before checking
        const stripped = raw.replace(/\/\/.*$/, '');

        if (PT_ACCENT_RE.test(stripped)) {
          violations.push({
            file: path.relative(UI_ROOT, filePath),
            line: i + 1,
            content: raw.trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.content}`)
        .join('\n');
      // Fail with a descriptive message listing every violation
      expect.fail(
        `Found ${violations.length} hardcoded Portuguese string(s):\n${report}\n\n` +
          'Move these strings to apps/ui/messages/pt-BR.json and use t() / useTranslations().',
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test: message JSON files structural symmetry
// ---------------------------------------------------------------------------

describe('i18n: message JSON files (en.json / pt-BR.json) structural symmetry', () => {
  it('en.json exists and is valid JSON', () => {
    const enPath = path.join(MESSAGES_DIR, 'en.json');
    expect(fs.existsSync(enPath), `Missing file: ${enPath}`).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(enPath, 'utf-8'))).not.toThrow();
  });

  it('pt-BR.json exists and is valid JSON', () => {
    const ptPath = path.join(MESSAGES_DIR, 'pt-BR.json');
    expect(fs.existsSync(ptPath), `Missing file: ${ptPath}`).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(ptPath, 'utf-8'))).not.toThrow();
  });

  it('en.json and pt-BR.json share the same top-level keys', () => {
    const en = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'en.json'), 'utf-8'));
    const pt = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'pt-BR.json'), 'utf-8'));

    const enKeys = Object.keys(en).sort();
    const ptKeys = Object.keys(pt).sort();

    expect(enKeys).toEqual(ptKeys);
  });

  it('en.json and pt-BR.json have identical nested key structure (all leaf paths match)', () => {
    const en = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'en.json'), 'utf-8'));
    const pt = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'pt-BR.json'), 'utf-8'));

    const enLeaves = collectLeafKeys(en).sort();
    const ptLeaves = collectLeafKeys(pt).sort();

    const onlyInEn = enLeaves.filter((k) => !ptLeaves.includes(k));
    const onlyInPt = ptLeaves.filter((k) => !enLeaves.includes(k));

    if (onlyInEn.length > 0 || onlyInPt.length > 0) {
      const report = [
        onlyInEn.length > 0 ? `Keys only in en.json (${onlyInEn.length}):\n${onlyInEn.map((k) => `  - ${k}`).join('\n')}` : '',
        onlyInPt.length > 0 ? `Keys only in pt-BR.json (${onlyInPt.length}):\n${onlyInPt.map((k) => `  - ${k}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      expect.fail(`Message JSON files have mismatched keys:\n\n${report}`);
    }

    expect(enLeaves).toEqual(ptLeaves);
  });

  it('all values in en.json are non-empty strings', () => {
    const en = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'en.json'), 'utf-8'));
    const leaves = collectLeafKeys(en);

    function getValue(obj: unknown, keyPath: string): unknown {
      return keyPath.split('.').reduce<unknown>((acc, k) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
        return undefined;
      }, obj);
    }

    const emptyOrMissing = leaves.filter((k) => {
      const v = getValue(en, k);
      return typeof v !== 'string' || v.trim() === '';
    });

    if (emptyOrMissing.length > 0) {
      expect.fail(
        `en.json has ${emptyOrMissing.length} empty or non-string value(s):\n` +
          emptyOrMissing.map((k) => `  - ${k}`).join('\n'),
      );
    }

    expect(emptyOrMissing).toHaveLength(0);
  });

  it('all values in pt-BR.json are non-empty strings', () => {
    const pt = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, 'pt-BR.json'), 'utf-8'));
    const leaves = collectLeafKeys(pt);

    function getValue(obj: unknown, keyPath: string): unknown {
      return keyPath.split('.').reduce<unknown>((acc, k) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
        return undefined;
      }, obj);
    }

    const emptyOrMissing = leaves.filter((k) => {
      const v = getValue(pt, k);
      return typeof v !== 'string' || v.trim() === '';
    });

    if (emptyOrMissing.length > 0) {
      expect.fail(
        `pt-BR.json has ${emptyOrMissing.length} empty or non-string value(s):\n` +
          emptyOrMissing.map((k) => `  - ${k}`).join('\n'),
      );
    }

    expect(emptyOrMissing).toHaveLength(0);
  });
});
