#!/usr/bin/env tsx
/**
 * Generates / updates the [Unreleased] section of CHANGELOG.md from conventional commits.
 *
 * Usage:
 *   tsx scripts/generate-changelog.ts              # update [Unreleased]
 *   tsx scripts/generate-changelog.ts --for 0.2.0  # promote [Unreleased] to a versioned release
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const GITHUB_REPO = 'livertonoliveira/forja';

// Conventional commit type → Keep-a-Changelog section
const TYPE_MAP: Record<string, string> = {
  feat: 'Adicionado',
  fix: 'Corrigido',
  perf: 'Alterado',
  refactor: 'Alterado',
  docs: 'Alterado',
  chore: 'Alterado',
  test: 'Adicionado',
  build: 'Alterado',
  ci: 'Alterado',
  style: 'Alterado',
  revert: 'Corrigido',
};

interface Commit {
  hash: string;
  type: string;
  scope: string | null;
  subject: string;
  breaking: boolean;
}

function getLatestTag(): string | null {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function getCommitsSinceTag(tag: string | null): Commit[] {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  let log: string;
  try {
    log = execSync(`git log ${range} --pretty=format:"%H%x01%s%x00"`, {
      encoding: 'utf8',
    });
  } catch {
    return [];
  }

  const commits: Commit[] = [];
  for (const record of log.split('\0')) {
    const trimmed = record.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf('\x01');
    if (sep < 0) continue;
    const hash = trimmed.slice(0, sep).trim();
    const subject = trimmed.slice(sep + 1).trim();
    if (!hash || !subject) continue;

    const match = subject.match(/^(\w+)(\(([^)]+)\))?(!)?:\s*(.+)$/);
    if (!match) continue;

    commits.push({
      hash: hash.trim(),
      type: match[1],
      scope: match[3] ?? null,
      subject: match[5].trim(),
      breaking: match[4] === '!',
    });
  }
  return commits;
}

function groupBySection(commits: Commit[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();

  // Breaking changes first
  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length > 0) {
    sections.set(
      'Quebra de compatibilidade',
      breaking.map((c) => `- ${c.subject}`),
    );
  }

  for (const commit of commits) {
    if (commit.breaking) continue;
    const section = TYPE_MAP[commit.type];
    if (!section) continue;
    if (!sections.has(section)) sections.set(section, []);
    const scope = commit.scope ? `**${commit.scope}**: ` : '';
    sections.get(section)!.push(`- ${scope}${commit.subject}`);
  }

  return sections;
}

function renderUnreleased(sections: Map<string, string[]>): string {
  if (sections.size === 0) return '## [Unreleased]\n\n_Nenhuma mudança desde o último release._\n';

  const lines = ['## [Unreleased]', ''];
  for (const [section, entries] of sections) {
    lines.push(`### ${section}`, ...entries, '');
  }
  return lines.join('\n');
}

function renderRelease(version: string, sections: Map<string, string[]>): string {
  const today = new Date().toISOString().slice(0, 10);
  if (sections.size === 0) return `## [${version}] — ${today}\n\n_Nenhuma mudança neste release._\n`;

  const lines = [`## [${version}] — ${today}`, ''];
  for (const [section, entries] of sections) {
    lines.push(`### ${section}`, ...entries, '');
  }
  return lines.join('\n');
}

function buildFooterLink(version: string, prevVersion: string | null): string {
  if (!prevVersion) {
    return `[${version}]: https://github.com/${GITHUB_REPO}/releases/tag/v${version}`;
  }
  return `[${version}]: https://github.com/${GITHUB_REPO}/compare/v${prevVersion}...v${version}`;
}

function updateChangelog(newBlock: string, forVersion?: string): void {
  const content = fs.existsSync(CHANGELOG_PATH)
    ? fs.readFileSync(CHANGELOG_PATH, 'utf-8')
    : '# Changelog\n\n';

  // Split into header (everything before first ##), body, and footer (links section)
  const footerSep = '\n---\n';
  const footerIdx = content.lastIndexOf(footerSep);
  const bodyPart = footerIdx >= 0 ? content.slice(0, footerIdx) : content;
  const footerPart = footerIdx >= 0 ? content.slice(footerIdx + footerSep.length) : '';

  let newBody: string;

  if (!forVersion) {
    // Replace or insert [Unreleased] section
    const unreleasedRegex = /## \[Unreleased\][\s\S]*?(?=\n## \[|\n*$)/;
    if (unreleasedRegex.test(bodyPart)) {
      newBody = bodyPart.replace(unreleasedRegex, newBlock + '\n');
    } else {
      // Insert after first header line
      const firstH2 = bodyPart.indexOf('\n## [');
      if (firstH2 >= 0) {
        newBody = bodyPart.slice(0, firstH2) + '\n' + newBlock + '\n' + bodyPart.slice(firstH2 + 1);
      } else {
        newBody = bodyPart + '\n' + newBlock + '\n';
      }
    }
  } else {
    // Promote [Unreleased] → versioned release and add empty [Unreleased]
    const latestTag = getLatestTag();
    const prevVersion = latestTag ? latestTag.replace(/^v/, '') : null;

    const emptyUnreleased = '## [Unreleased]\n\n_Nenhuma mudança desde o último release._\n';
    const releaseBlock = newBlock; // already rendered as versioned

    const unreleasedRegex = /## \[Unreleased\][\s\S]*?(?=\n## \[|\n*$)/;
    if (unreleasedRegex.test(bodyPart)) {
      newBody = bodyPart.replace(
        unreleasedRegex,
        emptyUnreleased + '\n' + releaseBlock + '\n',
      );
    } else {
      const firstH2 = bodyPart.indexOf('\n## [');
      if (firstH2 >= 0) {
        newBody =
          bodyPart.slice(0, firstH2) +
          '\n' +
          emptyUnreleased +
          '\n' +
          releaseBlock +
          '\n' +
          bodyPart.slice(firstH2 + 1);
      } else {
        newBody = bodyPart + '\n' + emptyUnreleased + '\n' + releaseBlock + '\n';
      }
    }

    // Update footer links
    const unreleasedLink = `[Unreleased]: https://github.com/${GITHUB_REPO}/compare/v${forVersion}...HEAD`;
    const versionLink = buildFooterLink(forVersion, prevVersion);

    let newFooter = footerPart;
    // Replace [Unreleased] link
    if (/\[Unreleased\]:/.test(newFooter)) {
      newFooter = newFooter.replace(/\[Unreleased\]:.*/, unreleasedLink);
    } else {
      newFooter = unreleasedLink + '\n' + newFooter;
    }
    // Add version link
    if (!new RegExp(`\\[${forVersion}\\]:`).test(newFooter)) {
      newFooter = newFooter.replace(unreleasedLink, unreleasedLink + '\n' + versionLink);
    }

    fs.writeFileSync(CHANGELOG_PATH, newBody + footerSep + newFooter, 'utf-8');
    console.log(`✓ CHANGELOG.md atualizado: [${forVersion}] adicionado.`);
    return;
  }

  // Update [Unreleased] footer link to point to latest tag
  const latestTag = getLatestTag();
  let newFooter = footerPart;
  if (latestTag) {
    const unreleasedLink = `[Unreleased]: https://github.com/${GITHUB_REPO}/compare/${latestTag}...HEAD`;
    if (/\[Unreleased\]:/.test(newFooter)) {
      newFooter = newFooter.replace(/\[Unreleased\]:.*/, unreleasedLink);
    }
  }

  fs.writeFileSync(CHANGELOG_PATH, newBody + (footerPart ? footerSep + newFooter : ''), 'utf-8');
  console.log('✓ CHANGELOG.md atualizado: seção [Unreleased] regenerada.');
}

function main(): void {
  const args = process.argv.slice(2);
  const forIdx = args.indexOf('--for');
  const forVersion = forIdx >= 0 ? args[forIdx + 1] : undefined;

  if (forVersion && !/^\d+\.\d+\.\d+$/.test(forVersion)) {
    console.error(`Versão inválida: "${forVersion}". Use o formato semver, ex: 0.2.0`);
    process.exit(1);
  }

  const latestTag = getLatestTag();
  const commits = getCommitsSinceTag(latestTag);
  const sections = groupBySection(commits);

  if (commits.length === 0 && !forVersion) {
    console.log('Nenhum commit novo desde o último release.');
    return;
  }

  const block = forVersion
    ? renderRelease(forVersion, sections)
    : renderUnreleased(sections);

  updateChangelog(block, forVersion);
}

main();
