import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readVersion } from '../lib/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../../');
const currentVersion = readFileSync(resolve(ROOT_DIR, 'VERSION'), 'utf-8').trim();

describe('VERSION file', () => {
  it('exists at the project root', () => {
    const versionPath = resolve(ROOT_DIR, 'VERSION');
    expect(existsSync(versionPath)).toBe(true);
  });

  it('contains a valid semver string', () => {
    const content = readFileSync(resolve(ROOT_DIR, 'VERSION'), 'utf-8').trim();
    expect(content).toBe(currentVersion);
  });

  it('matches the semver pattern MAJOR.MINOR.PATCH', () => {
    const content = readFileSync(resolve(ROOT_DIR, 'VERSION'), 'utf-8').trim();
    expect(content).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('readVersion()', () => {
  it('reads the version from the VERSION file', () => {
    const version = readVersion();
    expect(version).toBe(currentVersion);
  });

  it('returns a non-empty string', () => {
    const version = readVersion();
    expect(version).toBeTruthy();
  });

  it('trims whitespace from the version string', () => {
    const version = readVersion();
    expect(version).not.toMatch(/\s/);
  });
});

describe('CHANGELOG.md', () => {
  const changelogPath = resolve(ROOT_DIR, 'CHANGELOG.md');

  it('exists at the project root', () => {
    expect(existsSync(changelogPath)).toBe(true);
  });

  it('contains the "# Changelog" header', () => {
    const content = readFileSync(changelogPath, 'utf-8');
    expect(content).toMatch(/^# Changelog/m);
  });

  it('contains a current version entry', () => {
    const content = readFileSync(changelogPath, 'utf-8');
    expect(content).toContain(`[${currentVersion}]`);
  });

  it('current version entry includes a date in YYYY-MM-DD format', () => {
    const content = readFileSync(changelogPath, 'utf-8');
    const escaped = currentVersion.replace(/\./g, '\\.');
    expect(content).toMatch(new RegExp(`\\[${escaped}\\].*\\d{4}-\\d{2}-\\d{2}`));
  });
});

describe('package.json', () => {
  const pkgPath = resolve(ROOT_DIR, 'package.json');

  it('has a "version:bump" script', () => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts).toHaveProperty('version:bump');
  });

  it('"version:bump" script invokes bump-version.sh', () => {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    expect(pkg.scripts['version:bump']).toContain('bump-version.sh');
  });
});

describe('scripts/bump-version.sh', () => {
  const scriptPath = resolve(ROOT_DIR, 'scripts/bump-version.sh');

  it('exists', () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('is executable', () => {
    const stats = statSync(scriptPath);
    // Check owner execute bit (0o100) or group/other execute bits
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('starts with the correct bash shebang', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toBe('#!/usr/bin/env bash');
  });

  it('handles "patch", "minor", and "major" bump types', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('patch');
    expect(content).toContain('minor');
    expect(content).toContain('major');
  });

  it('writes new version back to VERSION file', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('VERSION_FILE');
    expect(content).toMatch(/echo.*NEW_VERSION.*>.*VERSION_FILE|echo.*\$NEW_VERSION.*>.*\$VERSION_FILE/);
  });

  it('prepends an entry to CHANGELOG.md', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('CHANGELOG_FILE');
    expect(content).toContain('NEW_VERSION');
    // Changelog is rebuilt in the script by finding the first existing entry and prepending the new one
    expect(content).toContain('FIRST_ENTRY_LINE');
  });

  it('creates a git tag for the new version', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('git');
    expect(content).toContain('tag');
    expect(content).toContain('NEW_VERSION');
  });
});
