import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

const SCRIPT = path.resolve(__dirname, '../generate-changelog.ts');

function runScript(args: string[], cwd: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`npx tsx ${SCRIPT} ${args.join(' ')}`, {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env },
    });
    return { stdout, stderr: '', code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.status ?? 1 };
  }
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir });
  execSync('git config user.email "test@test.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
}

function commit(dir: string, message: string, file = 'file.txt'): void {
  fs.writeFileSync(path.join(dir, file), message);
  execSync(`git add ${file}`, { cwd: dir });
  execSync(`git commit -m "${message}"`, { cwd: dir });
}

function tag(dir: string, name: string): void {
  execSync(`git tag ${name}`, { cwd: dir });
}

function writeChangelog(dir: string, content: string): void {
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), content, 'utf-8');
}

function readChangelog(dir: string): string {
  return fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf-8');
}

// Patch the script to use a different CHANGELOG path via env isn't easy with the current
// approach, so we run it in a temp git repo and override CHANGELOG_PATH via the script's
// __filename resolution. Instead, we use the script directly in tmp repos that have their
// own CHANGELOG.md and patch via symlink of the script.

// Simpler approach: run script in a temp dir that IS a git repo, and the script resolves
// CHANGELOG relative to __filename (script location). We copy the script into the temp dir.

function setupTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forja-changelog-test-'));
  initGitRepo(dir);
  // Copy script into temp repo
  const scriptContent = fs.readFileSync(SCRIPT, 'utf-8')
    .replace(
      "path.resolve(path.dirname(__filename), '..')",
      'path.resolve(path.dirname(__filename))',
    );
  fs.writeFileSync(path.join(dir, 'generate-changelog.ts'), scriptContent, 'utf-8');
  return dir;
}

function runScriptInRepo(dir: string, args: string[] = []): { stdout: string; stderr: string; code: number } {
  const scriptPath = path.join(dir, 'generate-changelog.ts');
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

describe('generate-changelog', () => {
  describe('Caso 1: commits unreleased (sem tags)', () => {
    it('popula seção [Unreleased] com feat e fix', () => {
      const dir = setupTempRepo();
      commit(dir, 'feat: add plugin system');
      commit(dir, 'fix: handle null config gracefully');
      writeChangelog(dir, '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] — 2026-01-01\n\n### Adicionado\n- inicial\n');

      const result = runScriptInRepo(dir, []);
      expect(result.code).toBe(0);

      const content = readChangelog(dir);
      expect(content).toContain('## [Unreleased]');
      expect(content).toContain('### Adicionado');
      expect(content).toContain('add plugin system');
      expect(content).toContain('### Corrigido');
      expect(content).toContain('handle null config gracefully');
    });
  });

  describe('Caso 2: --for <version> promove Unreleased para release', () => {
    it('move [Unreleased] para [0.2.0] e adiciona novo [Unreleased] vazio', () => {
      const dir = setupTempRepo();
      commit(dir, 'chore: init');
      tag(dir, 'v0.1.0');
      commit(dir, 'feat: add DSL gate parser');
      commit(dir, 'perf: optimize trace writer');
      writeChangelog(
        dir,
        '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] — 2026-01-01\n\n### Adicionado\n- inicial\n\n---\n\n[Unreleased]: https://github.com/test/repo/compare/v0.1.0...HEAD\n[0.1.0]: https://github.com/test/repo/releases/tag/v0.1.0\n',
      );

      const result = runScriptInRepo(dir, ['--for', '0.2.0']);
      expect(result.code).toBe(0);

      const content = readChangelog(dir);
      expect(content).toContain('## [0.2.0]');
      expect(content).toContain('add DSL gate parser');
      expect(content).toContain('optimize trace writer');
      // New empty [Unreleased] must exist
      expect(content).toMatch(/## \[Unreleased\]/);
      // Footer link for new version
      expect(content).toContain('[0.2.0]:');
      expect(content).toContain('v0.1.0...v0.2.0');
    });
  });

  describe('Caso 3: sem commits novos', () => {
    it('informa que não há commits novos e não modifica o arquivo', () => {
      const dir = setupTempRepo();
      commit(dir, 'feat: initial');
      tag(dir, 'v0.1.0');
      const original = '# Changelog\n\n## [Unreleased]\n\n_Nenhuma mudança._\n';
      writeChangelog(dir, original);

      const result = runScriptInRepo(dir, []);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Nenhum commit novo');

      const content = readChangelog(dir);
      expect(content).toBe(original);
    });
  });

  describe('Caso 4: breaking change', () => {
    it('aparece na seção "Quebra de compatibilidade"', () => {
      const dir = setupTempRepo();
      commit(dir, 'feat!: remove legacy config format');
      writeChangelog(dir, '# Changelog\n\n## [Unreleased]\n\n');

      const result = runScriptInRepo(dir, []);
      expect(result.code).toBe(0);

      const content = readChangelog(dir);
      expect(content).toContain('Quebra de compatibilidade');
      expect(content).toContain('remove legacy config format');
    });
  });

  describe('Caso 5: versão inválida com --for', () => {
    it('retorna exit code 1 e mensagem de erro', () => {
      const dir = setupTempRepo();
      commit(dir, 'feat: something');
      writeChangelog(dir, '# Changelog\n');

      const result = runScriptInRepo(dir, ['--for', 'invalid-version']);
      expect(result.code).toBe(1);
    });
  });
});
