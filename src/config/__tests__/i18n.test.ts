import { describe, it, expect } from 'vitest';
import { buildLanguageInstruction } from '../i18n.js';
import { SUPPORTED_ARTIFACT_LANGUAGES } from '../../schemas/config.js';

describe('buildLanguageInstruction()', () => {
  it('returns a string mentioning "English" for lang "en"', () => {
    const result = buildLanguageInstruction('en');
    expect(result).toContain('English');
  });

  it('returns a string mentioning "Brazilian Portuguese" and "English" for lang "pt-BR"', () => {
    const result = buildLanguageInstruction('pt-BR');
    expect(result).toContain('Brazilian Portuguese');
    expect(result).toContain('English');
  });

  it('returns a string mentioning "Japanese" for lang "ja"', () => {
    const result = buildLanguageInstruction('ja');
    expect(result).toContain('Japanese');
  });

  it('always contains "All code, variable names" regardless of lang', () => {
    const langs = ['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh-CN'] as const;
    for (const lang of langs) {
      expect(buildLanguageInstruction(lang)).toContain('All code, variable names');
    }
  });

  it('every SUPPORTED_ARTIFACT_LANGUAGE resolves to a defined language name (no "undefined" in output)', () => {
    for (const lang of SUPPORTED_ARTIFACT_LANGUAGES) {
      const instruction = buildLanguageInstruction(lang);
      expect(instruction).not.toContain('undefined');
      expect(instruction.length).toBeGreaterThan(20);
    }
  });
});
