import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, cpSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '../..');
const currentVersion = readFileSync(pathResolve(ROOT, 'VERSION'), 'utf-8').trim();

function bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function createTempProject(): string {
  const tmpDir = mkdtempSync(join(tmpdir(), 'forja-version-test-'));

  // Copy relevant files
  cpSync(join(ROOT, 'VERSION'), join(tmpDir, 'VERSION'));
  cpSync(join(ROOT, 'CHANGELOG.md'), join(tmpDir, 'CHANGELOG.md'));

  // Copy scripts dir
  cpSync(join(ROOT, 'scripts'), join(tmpDir, 'scripts'), { recursive: true });

  // Initialize a git repo so the script can create tags
  execSync('git init && git config user.email "test@test.com" && git config user.name "Test" && git add . && git commit -m "init"', {
    cwd: tmpDir,
    stdio: 'pipe',
  });

  return tmpDir;
}

describe('CLI --version flag', () => {
  it('node bin/forja --version outputs the current version', () => {
    const output = execSync(`node ${join(ROOT, 'bin/forja')} --version`, {
      encoding: 'utf-8',
    }).trim();

    expect(output).toBe(currentVersion);
  });
});

describe('bump-version.sh', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  it('patch bump: VERSION increments patch and CHANGELOG has new entry', () => {
    const tmpDir = createTempProject();
    tempDirs.push(tmpDir);
    const expectedVersion = bumpVersion(currentVersion, 'patch');

    const output = execSync(`bash ${join(tmpDir, 'scripts/bump-version.sh')} patch`, {
      cwd: tmpDir,
      encoding: 'utf-8',
    }).trim();

    const newVersion = readFileSync(join(tmpDir, 'VERSION'), 'utf-8').trim();
    expect(newVersion).toBe(expectedVersion);

    const changelog = readFileSync(join(tmpDir, 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toContain(`## [${expectedVersion}]`);

    expect(output).toContain(expectedVersion);
  });

  it('minor bump: VERSION increments minor and resets patch', () => {
    const tmpDir = createTempProject();
    tempDirs.push(tmpDir);
    const expectedVersion = bumpVersion(currentVersion, 'minor');

    execSync(`bash ${join(tmpDir, 'scripts/bump-version.sh')} minor`, {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    const newVersion = readFileSync(join(tmpDir, 'VERSION'), 'utf-8').trim();
    expect(newVersion).toBe(expectedVersion);

    const changelog = readFileSync(join(tmpDir, 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toContain(`## [${expectedVersion}]`);
  });

  it('major bump: VERSION increments major and resets minor and patch', () => {
    const tmpDir = createTempProject();
    tempDirs.push(tmpDir);
    const expectedVersion = bumpVersion(currentVersion, 'major');

    execSync(`bash ${join(tmpDir, 'scripts/bump-version.sh')} major`, {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    const newVersion = readFileSync(join(tmpDir, 'VERSION'), 'utf-8').trim();
    expect(newVersion).toBe(expectedVersion);

    const changelog = readFileSync(join(tmpDir, 'CHANGELOG.md'), 'utf-8');
    expect(changelog).toContain(`## [${expectedVersion}]`);
  });

  it('bump with no argument exits non-zero', () => {
    const tmpDir = createTempProject();
    tempDirs.push(tmpDir);

    expect(() => {
      execSync(`bash ${join(tmpDir, 'scripts/bump-version.sh')}`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    }).toThrow();
  });
});
