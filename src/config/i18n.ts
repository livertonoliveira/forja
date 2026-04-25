import { type ArtifactLanguage } from '../schemas/config.js';

const LANG_NAMES: Record<ArtifactLanguage, string> = {
  en: 'English',
  'pt-BR': 'Brazilian Portuguese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  'zh-CN': 'Simplified Chinese',
};

export function buildLanguageInstruction(artifactLang: ArtifactLanguage): string {
  return (
    `Generate all human-readable artifacts (issue titles, descriptions, documents, PR bodies, comments, reports) in ${LANG_NAMES[artifactLang]}.` +
    ` All code, variable names, file paths, and technical identifiers must remain in English.`
  );
}
