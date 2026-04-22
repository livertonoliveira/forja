import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { parseBumpFromCommits, computeNextVersion } from '../release.ts';

const SCRIPT = path.resolve(__dirname, '../release.ts');
const VALIDATE_UPGRADE_GUIDE_SCRIPT = path.resolve(__dirname, '../validate-upgrade-guide.ts');

function runRelease(dir: string, args: string[]): { stdout: string; stderr: string; code: number } {
  const scriptPath = path.join(dir, 'release.ts');
  try {
    const stdout = execSync(`npx tsx ${scriptPath} ${args.join(' ')}`, {
      cwd: dir,
      encoding: 'utf-8',
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.status ?? 1 };
  }
}

function setupReleaseRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-release-test-'));

  execSync('git init', { cwd: dir });
  execSync('git symbolic-ref HEAD refs/heads/main', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });

  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.1.0' }), 'utf-8');
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n', 'utf-8');

  execSync('git add .', { cwd: dir });
  execSync('git commit -m "chore: init"', { cwd: dir });
  execSync('git tag v0.1.0', { cwd: dir });

  // Copy and patch script, then commit it so the tree is clean
  const scriptContent = fs.readFileSync(SCRIPT, 'utf-8')
    .replace(
      "path.resolve(path.dirname(__filename), '..')",
      'path.resolve(path.dirname(__filename))',
    );
  fs.writeFileSync(path.join(dir, 'release.ts'), scriptContent, 'utf-8');
  // Copy validate-upgrade-guide.ts alongside release.ts so the import resolves
  fs.copyFileSync(VALIDATE_UPGRADE_GUIDE_SCRIPT, path.join(dir, 'validate-upgrade-guide.ts'));
  execSync('git add release.ts validate-upgrade-guide.ts', { cwd: dir });
  execSync('git commit -m "chore: add release script"', { cwd: dir });

  return dir;
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('parseBumpFromCommits', () => {
  it('returns minor for feat: commit', () => {
    expect(parseBumpFromCommits(['feat: add something'])).toBe('minor');
  });

  it('returns minor for feat(scope): commit', () => {
    expect(parseBumpFromCommits(['feat(core): add something'])).toBe('minor');
  });

  it('returns major for feat!: commit (breaking change marker)', () => {
    expect(parseBumpFromCommits(['feat!: remove legacy API'])).toBe('major');
  });

  it('returns major for feat(scope)!: commit', () => {
    expect(parseBumpFromCommits(['feat(cli)!: rename flag', 'fix: other'])).toBe('major');
  });

  it('returns patch for only fix/chore commits', () => {
    expect(parseBumpFromCommits(['fix: repair bug', 'chore: update deps'])).toBe('patch');
  });

  it('returns patch for empty list', () => {
    expect(parseBumpFromCommits([])).toBe('patch');
  });
});

describe('computeNextVersion', () => {
  it('increments patch', () => {
    expect(computeNextVersion('0.1.0', 'patch')).toBe('0.1.1');
  });

  it('increments minor and resets patch', () => {
    expect(computeNextVersion('0.1.3', 'minor')).toBe('0.2.0');
  });

  it('increments major and resets minor and patch', () => {
    expect(computeNextVersion('1.2.3', 'major')).toBe('2.0.0');
  });
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('Caso 1: working tree sujo', () => {
  it('exits 1 with "Working tree is not clean"', () => {
    const dir = setupReleaseRepo();
    fs.writeFileSync(path.join(dir, 'dirty.txt'), 'uncommitted', 'utf-8');

    const result = runRelease(dir, ['--yes', '--bump', 'patch']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Working tree is not clean');
  });
});

describe('Caso 2: validação de RFC para major', () => {
  it('exits 1 when SEMVER.md has no RFC reference', () => {
    const dir = setupReleaseRepo();
    fs.writeFileSync(path.join(dir, 'SEMVER.md'), '# Semver\n\nNo RFC here.\n', 'utf-8');
    execSync('git add SEMVER.md && git commit -m "chore: add semver"', { cwd: dir });

    const result = runRelease(dir, ['--dry-run', '--yes', '--bump', 'major']);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/RFC reference/i);
  });

  it('exits 0 and prints RFC reference found when SEMVER.md has RFC reference', () => {
    const dir = setupReleaseRepo();
    fs.writeFileSync(path.join(dir, 'SEMVER.md'), '# Semver\n\nRFC: docs/rfc/001-major.md\n', 'utf-8');
    // Create a valid upgrade guide for v1.0.0 (major bump from 0.1.0)
    fs.mkdirSync(path.join(dir, 'docs', 'upgrades'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs', 'upgrades', 'v1.0.0.md'),
      '# Upgrade Guide — v1.0\n\n## What\'s new\n\n- Added plugin system\n\n## Breaking changes\n\n- None.\n\n## Migration steps\n\n1. Run forja migrate\n',
      'utf-8',
    );
    execSync('git add SEMVER.md docs/', { cwd: dir });
    execSync('git commit -m "chore: add semver and upgrade guide"', { cwd: dir });

    const result = runRelease(dir, ['--dry-run', '--yes', '--bump', 'major']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('RFC reference found');
  });
});

describe('Caso 3: dry-run', () => {
  it('exits 0, prints [dry-run] messages, and leaves repo unchanged', () => {
    const dir = setupReleaseRepo();
    const headBefore = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
    const pkgBefore = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');

    const result = runRelease(dir, ['--dry-run', '--yes', '--bump', 'patch']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('[dry-run]');

    const headAfter = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
    expect(headAfter).toBe(headBefore);

    const pkgAfter = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
    expect(pkgAfter).toBe(pkgBefore);
  });
});
